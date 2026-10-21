/* "Today's read" card: rule-based observations with the numbers behind them,
   plus the optional AI explanation (POST /api/explain). */
import { AGE_LABEL, readMarket } from "../quant/narrative.js";
import { $ } from "./format.js";

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const AI_CACHE = "eqm.ai.v1";
const AI_TTL = 30 * 60_000;

let facts = null;
let busy = false;

/* past: the same facts 1, 5 and 10 sessions back, to tag how long each pattern has run. */
export function renderRead(f, past = null) {
  facts = f;
  const items = readMarket(f, 5, past);
  $("readList").innerHTML = items.map(r =>
    '<li class="read-item ' + (r.tone || "n") + '"><p>' +
    (r.age ? '<span class="read-age ' + r.age + '">' + AGE_LABEL[r.age] + "</span> " : "") + esc(r.text) + "</p>" +
    (r.evidence.length
      ? '<div class="chips">' + r.evidence.map(e => '<span class="chip"><b>' + esc(e.label) + "</b> " + esc(e.value) + "</span>").join("") + "</div>"
      : "") +
    "</li>"
  ).join("");
  $("readAsOf").textContent = f.asOf ? "Data to " + f.asOf : "";
}

function showAi(html, cls = "") {
  const out = $("aiOut");
  out.className = "ai-out " + cls;
  out.innerHTML = html;
  out.hidden = false;
}

function cached(key) {
  try {
    const c = JSON.parse(sessionStorage.getItem(AI_CACHE));
    return c && c.key === key && Date.now() - c.at < AI_TTL ? c.body : null;
  } catch { return null; }
}

function renderAnswer(body) {
  const paras = body.text.split(/\n{2,}/).map(p => "<p>" + esc(p.trim()) + "</p>").join("");
  const at = new Date(body.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });
  showAi(paras + '<p class="ai-meta">Written by Mistral AI from the numbers above at ' + at + " SGT. It can be wrong; check it against the indicators. Not advice.</p>");
}

const MESSAGES = {
  not_configured: "AI explanations aren't set up on this site yet. Add a MISTRAL_API_KEY in Netlify to turn them on.",
  bad_key: "The site's AI key was rejected. Check MISTRAL_API_KEY in Netlify.",
  busy: "Too many requests right now. Try again in a minute.",
  timeout: "That took too long. Try again.",
};

async function explain() {
  if (busy || !facts) return;
  const key = JSON.stringify(facts);
  const hit = cached(key);
  if (hit) { renderAnswer(hit); return; }
  busy = true;
  const btn = $("aiBtn");
  btn.disabled = true;
  btn.textContent = "Writing…";
  showAi('<p class="ai-wait">Reading the dashboard…</p>', "wait");
  try {
    const res = await fetch("/api/explain", { method: "POST", headers: { "content-type": "application/json" }, body: key });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.text) {
      renderAnswer(body);
      try { sessionStorage.setItem(AI_CACHE, JSON.stringify({ key, at: Date.now(), body })); } catch { /* storage blocked */ }
    } else if (res.ok && body.refused) {
      showAi("<p>The AI declined to write a note for this data. The rule-based read above still applies.</p>", "err");
    } else {
      const msg = MESSAGES[body.error] || (res.status === 404 ? "AI explanations only work on the deployed site." : "Couldn't get an explanation right now.");
      showAi("<p>" + esc(msg) + "</p>", "err");
    }
  } catch {
    showAi("<p>" + (navigator.onLine ? "Couldn't reach the server." : "You're offline. The rule-based read above still works.") + "</p>", "err");
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = "Explain in plain English";
  }
}

export function initRead() {
  $("aiBtn").addEventListener("click", explain);
}
