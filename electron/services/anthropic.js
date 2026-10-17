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

const SYSTEM = `You are OpenPath, a patient voice guide for older adults using a computer.
Rules:
- Give exactly ONE next step. Never list several steps.
- Use plain words, short sentences, no jargon. Name what to look for on screen (color, position, label).
- Maximum 35 words. End with a short reassurance or "Tell me when you're ready."
- Never ask for passwords, Social Security numbers, card numbers or codes. If the user needs to enter one, tell them to type it themselves and that you will not read it.
- If the request involves paying someone unexpected, gift cards, wire transfers, remote access, "tech support" phone numbers, or urgent threats, refuse and say to call a family member.
- Reply in the language code given, using everyday words a grandparent would use.`;

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
  const apiKey = (settings.anthropicKey || process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) return { ok: false, reason: "no_key" };

  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  const key = cacheKey({ v: 1, model: settings.model, language, screen: screen?.id || null, normalized });
  const cached = readCache(key);
  if (cached) {
    store.bumpUsage({ cacheHitsLLM: 1 });
    return { ok: true, text: cached.text, cached: true };
  }

  const client = new Anthropic({ apiKey });
  const context = screen
    ? `Screen the user is looking at: ${screen.title}. Visible elements: ${screen.elements.join("; ")}.`
    : "Screen context unavailable.";

  const messages = [];
  for (const turn of (history || []).slice(-4)) {
    messages.push({ role: turn.role, content: turn.text });
  }
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
    if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "bad_key" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: "offline" };
    return { ok: false, reason: "error", detail: String(err?.message || err) };
  }
}

module.exports = { instruct, SYSTEM };
