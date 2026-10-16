/* POST /api/explain: a short plain-English note written by Claude from the
   dashboard's numbers.

   Setup: Netlify → Site configuration → Environment variables → add
   ANTHROPIC_API_KEY (Functions scope). Optional: EXPLAIN_MODEL to override the
   model. Without the key the endpoint answers 503 and the button explains why.

   Cost control: numbers-only input, per-IP rate limit, a 30-minute cache per
   identical data block, low effort and a bounded max_tokens. Set a monthly
   spend limit on the key in the Anthropic Console as the backstop. */
import Anthropic from "@anthropic-ai/sdk";
import { buildPrompt, validateFacts } from "../../src/ai/explain.js";

export const config = {
  path: "/api/explain",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

const MODEL = process.env.EXPLAIN_MODEL || "claude-opus-5-5";
/* Server-side refusal fallback, on the models that accept it. */
const FALLBACKS = /^claude-(opus-5|fable-5-1|sonnet-5-5)/.test(MODEL);
const CACHE_MS = 30 * 60_000;
const cache = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(503, { error: "not_configured" });

  /* Browsers send Origin on cross-site POSTs; only this site may call it. */
  const origin = req.headers.get("origin");
  if (origin) {
    try { if (new URL(origin).host !== new URL(req.url).host) return json(403, { error: "forbidden" }); }
    catch { return json(403, { error: "forbidden" }); }
  }

  const raw = await req.text();
  if (raw.length > 16_000) return json(413, { error: "too_large" });
  let facts;
  try { facts = validateFacts(JSON.parse(raw)); } catch { return json(400, { error: "bad_request" }); }

  const { system, user, key } = buildPrompt(facts);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(200, { ...hit.body, cached: true });

  /* Netlify's synchronous functions stop at about 10 seconds, so fail fast. */
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 9_000 });
  try {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low" },
      ...(FALLBACKS ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      system,
      messages: [{ role: "user", content: user }],
    });
    if (msg.stop_reason === "refusal") return json(200, { text: null, refused: true });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("\n\n").trim();
    if (!text) return json(502, { error: "empty" });
    const body = { text, model: msg.model, at: new Date().toISOString(), truncated: msg.stop_reason === "max_tokens" };
    cache.set(key, { at: Date.now(), body });
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return json(200, body);
  } catch (e) {
    /* Most specific first: in the TypeScript SDK these all extend APIError. */
    if (e instanceof Anthropic.APIConnectionTimeoutError) return json(504, { error: "timeout" });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return json(503, { error: "bad_key" });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "busy" });
    if (e instanceof Anthropic.APIConnectionError) return json(502, { error: "unreachable" });
    if (e instanceof Anthropic.APIError) return json(502, { error: "upstream", status: e.status ?? null });
    return json(500, { error: "internal" });
  }
}
