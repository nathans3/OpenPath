// Instruction engine backed by Claude. The renderer has already redacted
// sensitive data and run the scam guardrail before anything reaches here.
// Cost controls: short system prompt, hard max_tokens cap, prompt caching on
// the stable system prompt, and a small on-disk answer cache keyed by SHA-256.

const Anthropic = require("@anthropic-ai/sdk");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const store = require("./store");
const vision = require("./vision");

const SYSTEM = `You are OpenPath, a patient voice guide for older adults using a computer.
Rules:
- Give exactly ONE next step. Never list several steps.
- Use plain words, short sentences, no jargon. Name what to look for on screen (color, position, label).
- Maximum 35 words. End with a short reassurance or "Tell me when you're ready."
- Never ask for passwords, Social Security numbers, card numbers or codes. If the user needs to enter one, tell them to type it themselves and that you will not read it.
- If the request involves paying someone unexpected, gift cards, wire transfers, remote access, "tech support" phone numbers, or urgent threats, refuse and say to call a family member.
- Reply in the language code given, using everyday words a grandparent would use.
- Often you only know the titles of the open windows. Then rely on what you know about that app's current layout (menu names, where buttons usually are) and say exactly where to look and what to click.
- If the question could mean two things (for example a browser tab or a tab inside Google Docs), answer the most likely one for the front window and mention the other in a few words.`;

const CACHE_DIR = () => path.join(app.getPath("userData"), "cache", "answers");

function cacheKey(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

function readCache(key) {
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR(), key + ".json"), "utf8")); } catch { return null; }
}
function writeCache(key, value) {
  try {
    fs.mkdirSync(CACHE_DIR(), { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR(), key + ".json"), JSON.stringify(value));
  } catch { /* cache is best-effort */ }
}

async function instruct({ query, language, screen, history }, settings) {
  const { client, apiKey } = makeClient(settings);
  if (!client) return { ok: false, reason: "no_key" };

  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  // The cache key covers what is on screen and the last exchange, so "done"
  // in one conversation is never answered with a reply from another.
  const key = cacheKey({
    v: 2, model: settings.model, language, normalized,
    screen: screen ? [screen.id, ...(screen.elements || [])] : null,
    recent: (history || []).slice(-2).map((h) => h.text),
  });
  const cached = readCache(key);
  if (cached) {
    store.bumpUsage({ cacheHitsLLM: 1 });
    return { ok: true, text: cached.text, cached: true };
  }

  const context = screen
    ? `Screen the user is looking at: ${screen.title}. Visible elements: ${screen.elements.join("; ")}.`
    : "Screen context unavailable.";

  const messages = [];
  for (const turn of (history || []).slice(-4)) {
    messages.push({ role: turn.role, content: turn.text });
  }
  while (messages.length && messages[0].role !== "user") messages.shift();   // must start with the person
  messages.push({ role: "user", content: `Language: ${language}\n${context}\nUser said: "${query}"` });

  try {
    const response = await client.messages.create({
      model: settings.model || "claude-haiku-5-5",
      max_tokens: 160,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "refusal" };
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    if (!text) return { ok: false, reason: "empty" };

    store.bumpUsage({
      llmCalls: 1,
      llmInputTokens: response.usage?.input_tokens || 0,
      llmOutputTokens: response.usage?.output_tokens || 0,
    });
    writeCache(key, { text, at: Date.now() });
    return { ok: true, text, cached: false, usage: response.usage };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: apiKey ? "bad_key" : "no_key" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: "offline" };
    return { ok: false, reason: "error", detail: String(err?.message || err) };
  }
}

// ---------- Pointing: Claude looks at a picture of the screen ----------
// Used for questions the built-in guides do not cover, only when the person
// allowed screen pictures and the front window is not a sensitive page.
const POINT_SCHEMA = {
  type: "object",
  properties: {
    say: { type: "string", description: "One short spoken instruction, at most 35 words." },
    has_target: { type: "boolean", description: "True when there is one thing on screen to click or type into." },
    target_label: { type: "string", description: "The exact text written on that thing, or a 1-3 word description if it is an icon. Empty if none." },
    x: { type: "integer", description: "Horizontal pixel position of the center of the target in the image." },
    y: { type: "integer", description: "Vertical pixel position of the center of the target in the image." },
  },
  required: ["say", "has_target", "target_label", "x", "y"],
  additionalProperties: false,
};

// Claude is "available" only when there is a real credential: a key typed
// into Settings, ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN (or .env), or an
// `ant auth login` profile on this computer.
function hasProfile() {
  try { return fs.existsSync(path.join(require("os").homedir(), ".config", "anthropic")); } catch { return false; }
}
function makeClient(settings) {
  const apiKey = (settings.anthropicKey || process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey && !process.env.ANTHROPIC_AUTH_TOKEN && !hasProfile()) return { client: null, apiKey };
  try { return { client: apiKey ? new Anthropic({ apiKey }) : new Anthropic(), apiKey }; } catch { return { client: null, apiKey }; }
}

function available(settings) { return !!makeClient(settings).client; }

async function point({ query, language, history, frontTitle }, settings) {
  const { client, apiKey } = makeClient(settings);
  if (!client) return { ok: false, reason: "no_key" };
  if (vision.isSensitive(frontTitle)) return { ok: false, reason: "sensitive" };

  let shot;
  try { shot = await vision.snapshotForClaude(); } catch { return { ok: false, reason: "capture_failed" }; }

  const messages = (history || []).slice(-4).map((t) => ({ role: t.role, content: t.text }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: shot.data } },
      { type: "text", text: `Language: ${language}\nThis is a picture of the person's whole screen, ${shot.width}×${shot.height} pixels. The front window is "${frontTitle || "unknown"}".\nThey said: "${query}"\nDecide the ONE next thing they should click or type into, give its center as x,y pixels in this picture, and write the spoken instruction in the "say" field. If nothing needs clicking, set has_target to false.` },
    ],
  });

  const base = {
    model: settings.model || "claude-haiku-5-5",
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  };

  let response;
  try {
    response = await client.messages.create({ ...base, output_config: { format: { type: "json_schema", schema: POINT_SCHEMA } } });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      // Older models without structured outputs: ask for JSON in words.
      try {
        response = await client.messages.create({ ...base, messages: [...messages.slice(0, -1), { role: "user", content: [...messages[messages.length - 1].content, { type: "text", text: 'Reply with only a JSON object: {"say":"…","has_target":true,"target_label":"…","x":0,"y":0}' }] }] });
      } catch (e2) { return mapError(e2, apiKey); }
    } else return mapError(err, apiKey);
  }

  if (response.stop_reason === "refusal") return { ok: false, reason: "refusal" };
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try { data = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { data = m ? JSON.parse(m[0]) : null; } catch { data = null; }
  }
  if (!data || typeof data.say !== "string" || !data.say.trim()) return { ok: false, reason: "empty" };

  store.bumpUsage({ llmCalls: 1, llmInputTokens: response.usage?.input_tokens || 0, llmOutputTokens: response.usage?.output_tokens || 0 });

  let target = null;
  if (data.has_target && Number.isFinite(data.x) && Number.isFinite(data.y)) {
    const guess = shot.toOverlay(data.x, data.y);
    target = { x: guess.x - 22, y: guess.y - 16, w: 44, h: 32, text: data.target_label || "" };
    // Snap to the real word on screen when the label is readable text.
    if (data.target_label && data.target_label.length <= 40) {
      const found = await vision.locate([data.target_label], guess);
      if (found.ok) {
        const c = { x: found.box.x + found.box.w / 2, y: found.box.y + found.box.h / 2 };
        if (Math.hypot(c.x - guess.x, c.y - guess.y) < 160) target = found.box;
      }
    }
  }
  return { ok: true, text: data.say.trim(), target, usage: response.usage };
}

function mapError(err, apiKey) {
  if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: apiKey ? "bad_key" : "no_key" };
  if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
  if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: "offline" };
  return { ok: false, reason: "error", detail: String(err?.message || err) };
}

module.exports = { instruct, point, available, SYSTEM };
