// Instruction engine backed by Claude. The renderer has already redacted
// sensitive data and run the scam guardrail before anything reaches here.
// Answers every question the built-in guides do not cover. Haiku answers first and Sonnet takes over
// when Haiku's answer cannot be checked on screen; plus a 35-word answer, an
// in-memory answer cache keyed by SHA-256, prompt caching on the system prompt,
// and a monthly allowance of expert answers.

const Anthropic = require("@anthropic-ai/sdk");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const store = require("./store");
const vision = require("./vision");
const privacy = require("./privacy");

// ---------- Which model ----------
// Answers come in two tiers, to keep cost low without lowering quality:
//   1. Claude Haiku 5.5 answers first (about 20x cheaper than Sonnet).
//   2. OpenPath checks the button Haiku names is really on screen. Only when
//      it is not does Claude Sonnet 5.5 (the "expert") answer instead.
// A monthly allowance of expert answers (300 by default) keeps a very heavy
// user's cost bounded; past it, Haiku's answer stands. "Lowest cost" uses
// Haiku only; a model picked in Setup is used directly. Server-side fallback
// (retrying a rare safety decline on another model) is switched off, because
// the retry could land on a model that must keep data for 30 days.
const BEST = "claude-sonnet-5-5", CHEAP = "claude-haiku-5-5";
const FALLBACK_MODELS = new Set();
// Anthropic's "Covered Models" (Fable, Mythos) must keep every prompt for at
// least 30 days and cannot use zero data retention, so OpenPath never sends a
// senior's question to them, even if an older setting names one.
const COVERED = /fable|mythos/i;

function month() { return new Date().toISOString().slice(0, 7); }
function expertLeft(settings) {
  const used = settings.usage?.llmMonth === month() ? settings.usage.bestCallsMonth || 0 : 0;
  return used < (settings.bestMonthlyCap ?? 300);
}
// The first model to ask, and whether a second (expert) try is allowed.
function plan(settings) {
  if (settings.modelChoice && !COVERED.test(settings.modelChoice)) return { first: settings.modelChoice, expert: null };
  if (settings.qualityMode === "low") return { first: CHEAP, expert: null };
  return { first: CHEAP, expert: expertLeft(settings) ? BEST : null };
}
function modelFor(settings) { return plan(settings).first; }

function countCall(model) {
  const u = store.getAll().usage;
  const prev = u.llmMonth === month() ? u.bestCallsMonth || 0 : 0;
  store.patch({ usage: { llmMonth: month(), bestCallsMonth: prev + (model === CHEAP ? 0 : 1) } });
}

// Sends a Messages request the way each model needs it.
async function send(client, body, { effort } = {}) {
  const model = body.model;
  const output_config = { ...(body.output_config || {}), ...(effort ? { effort } : {}) };
  const req = { ...body, output_config, max_tokens: Math.max(body.max_tokens, model === CHEAP ? 2000 : 4000) };   // room for thinking
  if (FALLBACK_MODELS.has(model)) return client.beta.messages.create({ ...req, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  return client.messages.create(req);
}

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

// Recent answers are kept in memory only (never on disk), so asking the same
// thing twice is instant and free. They vanish when OpenPath quits.
const answerCache = new Map();
function cacheKey(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
function readCache(key) { return answerCache.get(key) || null; }
function writeCache(key, value) {
  answerCache.set(key, value);
  if (answerCache.size > 200) answerCache.delete(answerCache.keys().next().value);
}

async function instruct({ query, language, screen, history }, settings) {
  const { client, apiKey } = makeClient(settings);
  if (!client) return { ok: false, reason: "no_key" };

  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  // The cache key covers what is on screen and the last exchange, so "done"
  // in one conversation is never answered with a reply from another.
  const key = cacheKey({
    v: 3, model: modelFor(settings), language, normalized,
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
    const model = modelFor(settings);   // Haiku first; no screen to check, so no expert retry
    const response = await send(client, {
      model,
      max_tokens: 160,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    }, { effort: "low" });
    countCall(model);

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
  try { return { client: apiKey ? new Anthropic({ apiKey, fetch: privacy.guardedFetch }) : new Anthropic({ fetch: privacy.guardedFetch }), apiKey }; } catch { return { client: null, apiKey }; }
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

  const { first, expert } = plan(settings);
  const one = await askForStep(client, apiKey, shot, messages, first);
  if (!one.ok) return one;
  // Accept the answer when nothing needs clicking, or its button is really there.
  if (!one.needsCheck || one.verified || !expert) return one;
  const two = await askForStep(client, apiKey, shot, messages, expert);
  return two.ok ? { ...two, escalated: true } : one;
}

async function askForStep(client, apiKey, shot, messages, model) {
  const base = {
    model,
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
  };

  let response;
  try {
    response = await send(client, { ...base, output_config: { format: { type: "json_schema", schema: POINT_SCHEMA } } }, { effort: model === CHEAP ? "low" : "medium" });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      // Models without structured outputs: ask for JSON in words.
      try {
        response = await send(client, { ...base, messages: [...messages.slice(0, -1), { role: "user", content: [...messages[messages.length - 1].content, { type: "text", text: 'Reply with only a JSON object: {"say":"…","has_target":true,"target_label":"…","x":0,"y":0}' }] }] }, { effort: "medium" });
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
  countCall(model);

  let target = null, verified = false;
  const needsCheck = !!(data.has_target && data.target_label);
  if (data.has_target && Number.isFinite(data.x) && Number.isFinite(data.y)) {
    const guess = shot.toOverlay(data.x, data.y);
    target = { x: guess.x - 22, y: guess.y - 16, w: 44, h: 32, text: data.target_label || "" };
    // Check the named button is really on screen, and snap to it.
    if (data.target_label && data.target_label.length <= 40) {
      const found = await vision.locate([data.target_label], guess);
      if (found.ok) {
        const c = { x: found.box.x + found.box.w / 2, y: found.box.y + found.box.h / 2 };
        if (Math.hypot(c.x - guess.x, c.y - guess.y) < 160) { target = found.box; verified = true; }
      }
    }
  }
  return { ok: true, text: data.say.trim(), target, verified, needsCheck, model, usage: response.usage };
}

function mapError(err, apiKey) {
  if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: apiKey ? "bad_key" : "no_key" };
  if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
  if (err instanceof Anthropic.APIConnectionError) return { ok: false, reason: "offline" };
  return { ok: false, reason: "error", detail: String(err?.message || err) };
}

module.exports = { instruct, point, available, modelFor, SYSTEM };
