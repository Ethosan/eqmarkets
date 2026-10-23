/* POST /api/explain: a short plain-English note written by Mistral from the
   dashboard's numbers.

   Setup: Cloudflare Pages → project → Settings → Environment variables → add
   MISTRAL_API_KEY. Optional: EXPLAIN_MODEL to override the model. Without the
   key the endpoint answers 503 and the button explains why.

   Cost control: numbers-only input, per-IP rate limit, a 30-minute cache per
   identical data block and a bounded max_tokens. Set a monthly spend limit in
   the Mistral console (Admin → Limits) as the backstop. */
import { buildPrompt, validateFacts } from "../../src/ai/explain.js";

const API_URL = "https://api.mistral.ai/v1/chat/completions";
const CACHE_MS = 30 * 60_000;
const cache = new Map();

/* Simple in-memory rate limit: 6 requests per IP per 60 seconds. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 6;
const rateHits = new Map(); // ip -> [windowStart, count]

function rateLimited(ip) {
  const now = Date.now();
  for (const [k, v] of rateHits) {
    if (now - v[0] > RATE_WINDOW_MS) rateHits.delete(k);
  }
  const v = rateHits.get(ip);
  if (v && now - v[0] <= RATE_WINDOW_MS) {
    if (v[1] >= RATE_MAX) return true;
    v[1]++;
  } else {
    rateHits.set(ip, [now, 1]);
  }
  return false;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

/* Content is a string, or an array of chunks on reasoning models; keep the text only. */
const textOf = content => typeof content === "string" ? content
  : Array.isArray(content) ? content.filter(c => c?.type === "text").map(c => c.text).join("\n\n")
  : "";

export async function onRequestPost(context) {
  const { request, env } = context;
  const req = request;

  const apiKey = env.MISTRAL_API_KEY;
  if (!apiKey) return json(503, { error: "not_configured" });

  const MODEL = env.EXPLAIN_MODEL || "mistral-medium-latest";

  /* Per-IP rate limit. */
  const ip = req.headers.get("cf-connecting-ip") || "unknown";
  if (rateLimited(ip)) return json(429, { error: "busy" });

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

  /* Cloudflare Pages Functions have a longer time limit than Netlify's 10s,
     so we can wait a bit longer for the upstream. */
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
      signal: AbortSignal.timeout(25_000),
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
