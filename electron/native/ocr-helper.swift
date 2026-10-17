// OpenPath screen reader: a small helper that stays running. For each request
// it takes a picture of the screen with ScreenCaptureKit (leaving out
// OpenPath's own windows, so it never reads its own words) and reads the text
// in it with macOS Vision. Everything happens on this computer; nothing is
// saved. One JSON request per line on stdin, one JSON answer per line on stdout.
//
// Request:  {"labels": ["Next"], "fast": false, "scale": 2,
//            "rect": {"x":0,"y":0,"w":800,"h":600}}      rect in screen points, optional
//           or {"file": "/tmp/x.png", "labels": [...]}     read an existing image
// Answer:   {"ok": true, "matches": [{"label","text","exact","word","x","y","w","h"}]}
//           coordinates 0–1 of the captured area, origin top-left;
//           with no labels, every line: [{"text","x","y","w","h"}]
import Foundation
import Vision
import AppKit
import ScreenCaptureKit
import ApplicationServices

struct Rect: Decodable { let x: Double; let y: Double; let w: Double; let h: Double }
struct Request: Decodable { let cmd: String?; let file: String?; let labels: [String]?; let fast: Bool?; let scale: Double?; let rect: Rect? }

func isWordChar(_ c: Character) -> Bool { c.isLetter || c.isNumber }

var cachedContent: SCShareableContent? = nil
var cachedAt = Date.distantPast

func capture(scale: Double, rect: Rect?) -> CGImage? {
  let sem = DispatchSemaphore(value: 0)
  var image: CGImage? = nil
  Task {
    defer { sem.signal() }
    do {
      if cachedContent == nil || Date().timeIntervalSince(cachedAt) > 2 {
        cachedContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        cachedAt = Date()
      }
      guard let content = cachedContent,
            let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() }) ?? content.displays.first else { return }
      // Leave out OpenPath itself (the app that started this helper).
      let me = getppid()
      let mine = content.applications.filter { $0.processID == me }
      let filter = SCContentFilter(display: display, excludingApplications: mine, exceptingWindows: [])
      let cfg = SCStreamConfiguration()
      cfg.showsCursor = false
      if let r = rect {
        cfg.sourceRect = CGRect(x: r.x, y: r.y, width: r.w, height: r.h)
        cfg.width = max(1, Int(r.w * scale)); cfg.height = max(1, Int(r.h * scale))
      } else {
        cfg.width = Int(Double(display.width) * scale); cfg.height = Int(Double(display.height) * scale)
      }
      image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: cfg)
    } catch {
      image = nil
      FileHandle.standardError.write(Data("capture error: \(error)\n".utf8))
    }
  }
  sem.wait()
  return image
}

func read(_ cg: CGImage, labels: [String], fast: Bool) -> [[String: Any]] {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = fast ? .fast : .accurate
  request.usesLanguageCorrection = false
  if #available(macOS 13.0, *) { request.automaticallyDetectsLanguage = true }
  try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
  var out: [[String: Any]] = []
  for obs in request.results ?? [] {
    guard let cand = obs.topCandidates(1).first else { continue }
    let text = cand.string, lower = text.lowercased(), lb = obs.boundingBox
    if labels.isEmpty { out.append(["text": text, "x": lb.minX, "y": 1 - lb.maxY, "w": lb.width, "h": lb.height]); continue }
    for label in labels {
      guard let r = lower.range(of: label.lowercased()) else { continue }
      var b = lb
      let lo = text.index(text.startIndex, offsetBy: lower.distance(from: lower.startIndex, to: r.lowerBound), limitedBy: text.endIndex) ?? text.startIndex
      let hi = text.index(lo, offsetBy: label.count, limitedBy: text.endIndex) ?? text.endIndex
      if let box = try? cand.boundingBox(for: lo..<hi)?.boundingBox { b = box }
      let before: Character = r.lowerBound == lower.startIndex ? " " : lower[lower.index(before: r.lowerBound)]
      let after: Character = r.upperBound == lower.endIndex ? " " : lower[r.upperBound]
      out.append(["label": label, "text": text,
                  "exact": lower.trimmingCharacters(in: .whitespaces) == label.lowercased(),
                  "word": !isWordChar(before) && !isWordChar(after),
                  "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height])
    }
  }
  return out
}


// ---------- Browser parts: where the Back button and the address bar are ----------
// Reads the frontmost app's accessibility information (the same structure
// screen readers use). Only reads positions; never presses anything. Needs the
// Accessibility permission; without it, returns the app and window only.
let browserBundles: Set<String> = ["com.apple.Safari", "com.google.Chrome", "com.brave.Browser", "com.microsoft.edgemac", "org.mozilla.firefox", "company.thebrowser.Browser", "com.operasoftware.Opera", "com.vivaldi.Vivaldi", "org.chromium.Chromium"]

func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
  var v: AnyObject?
  return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
}
func frame(_ el: AXUIElement) -> [String: Double]? {
  guard let p = attr(el, kAXPositionAttribute), let z = attr(el, kAXSizeAttribute) else { return nil }
  var pt = CGPoint.zero, sz = CGSize.zero
  AXValueGetValue(p as! AXValue, .cgPoint, &pt); AXValueGetValue(z as! AXValue, .cgSize, &sz)
  if sz.width < 4 || sz.height < 4 { return nil }
  return ["x": Double(pt.x), "y": Double(pt.y), "w": Double(sz.width), "h": Double(sz.height)]
}
func str(_ el: AXUIElement, _ name: String) -> String { (attr(el, name) as? String ?? "").lowercased() }

func browserParts() -> [String: Any] {
  guard let app = NSWorkspace.shared.frontmostApplication else { return ["ok": false] }
  let bundle = app.bundleIdentifier ?? ""
  var out: [String: Any] = ["ok": true, "app": app.localizedName ?? "", "bundle": bundle, "isBrowser": browserBundles.contains(bundle), "trusted": AXIsProcessTrusted()]
  // Window bounds without any permission.
  if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
    for w in list where (w[kCGWindowOwnerPID as String] as? Int32) == app.processIdentifier && (w[kCGWindowLayer as String] as? Int) == 0 {
      if let b = w[kCGWindowBounds as String] as? [String: Double] { out["window"] = ["x": b["X"] ?? 0, "y": b["Y"] ?? 0, "w": b["Width"] ?? 0, "h": b["Height"] ?? 0]; break }
    }
  }
  guard AXIsProcessTrusted() else { return out }
  let root = AXUIElementCreateApplication(app.processIdentifier)
  let start: AXUIElement = (attr(root, kAXFocusedWindowAttribute) as! AXUIElement?) ?? root
  var queue: [(AXUIElement, Int)] = [(start, 0)], seen = 0
  while !queue.isEmpty && seen < 4000 {
    let (el, depth) = queue.removeFirst(); seen += 1
    let role = str(el, kAXRoleAttribute)
    let label = [str(el, kAXDescriptionAttribute), str(el, kAXTitleAttribute), str(el, kAXHelpAttribute), str(el, "AXIdentifier")].joined(separator: " ")
    if out["back"] == nil && role == "axbutton" && (label.hasPrefix("back") || label.contains(" back") || label.contains("go back")), let f = frame(el) { out["back"] = f }
    if out["address"] == nil && (role == "axtextfield" || role == "axcombobox") && (label.contains("address") || label.contains("search") || label.contains("url") || label.contains("location")), let f = frame(el) { out["address"] = f }
    if out["back"] != nil && out["address"] != nil { break }
    if depth < 14, let kids = attr(el, kAXChildrenAttribute) as? [AXUIElement] { for k in kids { queue.append((k, depth + 1)) } }
  }
  return out
}

setvbuf(stdout, nil, _IOLBF, 0)
while let line = readLine() {
  var answer: [String: Any] = ["ok": false]
  if let data = line.data(using: .utf8), let req = try? JSONDecoder().decode(Request.self, from: data), req.cmd == "browser" {
    answer = browserParts()
  } else if let data = line.data(using: .utf8), let req = try? JSONDecoder().decode(Request.self, from: data) {
    var cg: CGImage? = nil
    if let f = req.file { cg = NSImage(contentsOfFile: f)?.cgImage(forProposedRect: nil, context: nil, hints: nil) }
    else { cg = capture(scale: req.scale ?? 2, rect: req.rect) }
    if let img = cg { answer = ["ok": true, "matches": read(img, labels: req.labels ?? [], fast: req.fast ?? false)] }
    else { answer = ["ok": false, "reason": "capture_failed"] }
  }
  let json = (try? JSONSerialization.data(withJSONObject: answer)) ?? Data("{\"ok\":false}".utf8)
  FileHandle.standardOutput.write(json); FileHandle.standardOutput.write(Data("\n".utf8))
}
