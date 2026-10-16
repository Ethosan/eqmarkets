/* POST /api/explain: a short plain-English note written by Mistral from the
   dashboard's numbers.

   Setup: Netlify → Site configuration → Environment variables → add
   MISTRAL_API_KEY (Functions scope). Optional: EXPLAIN_MODEL to override the
   model. Without the key the endpoint answers 503 and the button explains why.

   Cost control: numbers-only input, per-IP rate limit, a 30-minute cache per
   identical data block and a bounded max_tokens. Set a monthly spend limit in
   the Mistral console (Admin → Limits) as the backstop. */
import { buildPrompt, validateFacts } from "../../src/ai/explain.js";

export const config = {
  path: "/api/explain",
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] },
};

const API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = process.env.EXPLAIN_MODEL || "mistral-medium-latest";
const CACHE_MS = 30 * 60_000;
const cache = new Map();

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

/* Content is a string, or an array of chunks on reasoning models; keep the text only. */
const textOf = content => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter(c => c?.type === "text").map(c => c.text).join("\n\n")
  : "";

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const apiKey = process.env.MISTRAL_API_KEY;
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
  let res;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.3,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(9_000),
    });
  } catch (e) {
    if (e?.name === "TimeoutError" || e?.name === "AbortError") return json(504, { error: "timeout" });
    return json(502, { error: "unreachable" });
  }

  if (res.status === 401 || res.status === 403) return json(503, { error: "bad_key" });
  if (res.status === 429) return json(429, { error: "busy" });
  if (!res.ok) return json(502, { error: "upstream", status: res.status });

  let data;
  try { data = await res.json(); } catch { return json(502, { error: "upstream", status: res.status }); }
  const choice = data?.choices?.[0];
  const text = textOf(choice?.message?.content).trim();
  if (!text) return json(502, { error: "empty" });
  const body = {
    text,
    model: data.model || MODEL,
    at: new Date().toISOString(),
    truncated: choice.finish_reason === "length" || choice.finish_reason === "model_length",
  };
  cache.set(key, { at: Date.now(), body });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return json(200, body);
}
