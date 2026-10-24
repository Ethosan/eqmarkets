/* "API, terms & privacy" sheet: the public API contract and the legal text,
   surfaced on-site so they are one tap away from the footer. The wording mirrors
   README.md (Public API), TERMS.md and PRIVACY.md — keep the four in sync. */
import { $ } from "./format.js";
import { swipeToClose } from "./sheet.js";

const SECTIONS = [
  { id: "api", label: "API" },
  { id: "terms", label: "Terms" },
  { id: "privacy", label: "Privacy" },
];

const BODY = () => `
<section id="a-api" class="g-sec">
  <h3>Public API: regime and risk</h3>
  <p>Two read-only endpoints expose the dashboard's own models — the growth × inflation regime and the Risk Appetite Index — computed with the same code the site runs, so the API and the dashboard always agree. Free for now: no key, no account, no signup. CORS is open, so you can call them from anywhere, browser or server.</p>
  <table class="g-table">
    <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
    <tbody>
      <tr><td><code>GET /api/regime</code></td><td>The growth × inflation regime</td></tr>
      <tr><td><code>GET /api/risk</code></td><td>The Risk Appetite Index level</td></tr>
    </tbody>
  </table>

  <p><b>GET /api/regime</b> — the growth × inflation regime.</p>
  <dl class="g-defs">
    <div><dt>quadrant · label</dt><dd>The regime's quadrant (<code>goldilocks</code>, <code>reflation</code>, <code>stagflation</code>, <code>slowdown</code>) and its display label.</dd></div>
    <div><dt>confidence</dt><dd>How settled the read is.</dd></div>
    <div><dt>growth · inflation</dt><dd>The two axis scores.</dd></div>
    <div><dt>readingQuadrant</dt><dd>The quadrant this week's raw reading points to. It can differ from <code>quadrant</code> while a switch is still being confirmed.</dd></div>
    <div><dt>provisional</dt><dd><code>true</code> while a switch is being confirmed over its three weeks.</dd></div>
    <div><dt>weeksIn · since</dt><dd>How many weeks the current regime has held, and the week it started (ISO date).</dd></div>
    <div><dt>pending</dt><dd>A description of a switch that is building, or <code>null</code>.</dd></div>
    <div><dt>switchesYear</dt><dd>Regime switches so far this year.</dd></div>
    <div><dt>asOf · updated · stale</dt><dd><code>asOf</code> is the latest market session the numbers cover. <code>updated</code> is when this snapshot was computed (ISO). <code>stale</code> is <code>true</code> when a refresh failed and the last good read is being served.</dd></div>
  </dl>

  <p><b>GET /api/risk</b> — the Risk Appetite Index level.</p>
  <dl class="g-defs">
    <div><dt>value · latest</dt><dd>The index level in sigma (−2 to +2), and the most recent daily value.</dd></div>
    <div><dt>label</dt><dd><code>Risk-on</code>, <code>Leaning risk-on</code>, <code>Neutral</code>, <code>Leaning risk-off</code> or <code>Risk-off</code>.</dd></div>
    <div><dt>inputs · total</dt><dd>How many of the 8 inputs had data, out of the 8 the index can use.</dd></div>
    <div><dt>contributions</dt><dd>Per input, <code>[{ id, label, score }]</code>, each score capped at ±3.</dd></div>
    <div><dt>asOf · updated · stale</dt><dd>As above.</dd></div>
  </dl>

  <p><b>Call them:</b></p>
<pre class="code"><code>curl https://markets.ethantam.dev/api/regime
curl https://markets.ethantam.dev/api/risk</code></pre>
<pre class="code"><code>const [regime, risk] = await Promise.all([
  fetch("https://markets.ethantam.dev/api/regime").then(r =&gt; r.json()),
  fetch("https://markets.ethantam.dev/api/risk").then(r =&gt; r.json()),
]);</code></pre>

  <p><b>A response looks like</b> (values are live, so they change):</p>
<pre class="code"><code>// GET /api/risk
{
  "value": -1.13,
  "latest": -1.13,
  "label": "Risk-off",
  "inputs": 8,
  "total": 8,
  "contributions": [
    { "id": "es", "label": "S&amp;P 500 futures", "score": -2.1 }
  ],
  "asOf": "2026-10-23",
  "updated": "2026-10-24T02:14:00.000Z",
  "stale": false
}</code></pre>

  <dl class="g-defs">
    <div><dt>Freshness</dt><dd>One snapshot is computed per five minutes per function instance; responses are edge-cached for 60 seconds (<code>Cache-Control: public, max-age=60</code>). Fields are additive — new ones may appear without notice.</dd></div>
    <div><dt>Limits</dt><dd>30 requests a minute per IP, kept in memory, so it resets when the function restarts.</dd></div>
    <div><dt>Errors</dt><dd><code>429 { "error": "busy" }</code> when rate-limited; <code>503 { "error": "unavailable" }</code> when no read exists yet. An error body is the only thing an error ever says.</dd></div>
    <div><dt>Fair use</dt><dd>Don't scrape the service or try to get around the limits. The endpoints take no input, hold no secrets and change no state; a flood is absorbed by the edge cache, the five-minute snapshot cache and a one-minute failure backoff, so the upstream feeds and the rest of the site are not put at risk. If the API ever costs real money to run, it gets a key or a tighter limit before anything else changes.</dd></div>
    <div><dt>Not advice</dt><dd>The numbers are context, computed from public data, and can be wrong. Nothing here is financial advice.</dd></div>
  </dl>
</section>

<section id="a-terms" class="g-sec">
  <h3>Terms</h3>
  <p>These terms cover your use of Equarian Markets, a personal project by Ethan Tam. By using the app you agree to them. The full text lives in <code>TERMS.md</code> in the repository.</p>
  <dl class="g-defs">
    <div><dt>Not financial advice</dt><dd>Everything on the page is computed from public market data and can be wrong. Nothing here is financial, investment, trading, tax or legal advice. Don't make trading or investment decisions based on it — do your own research and consult a qualified professional.</dd></div>
    <div><dt>The models can be wrong</dt><dd>Every model is a simplification with known limitations. Backtested performance is not a guarantee of future results.</dd></div>
    <div><dt>The AI can be wrong</dt><dd>The "Explain in plain English" feature is powered by Mistral AI. It can hallucinate and give confident-sounding answers that are wrong. Treat every explanation as a second opinion, not a conclusion.</dd></div>
    <div><dt>The data can be wrong</dt><dd>Market data comes from Yahoo Finance, FRED, the Bank of Japan and the CFTC. It can be delayed, revised or incorrect. Verify anything that matters against the original source.</dd></div>
    <div><dt>Fair use</dt><dd>Don't scrape the service, try to get around rate limits, or interfere with how it runs. The public API is free to call within its rate limits; if that ever changes, this page says so first.</dd></div>
    <div><dt>Your device</dt><dd>As an installable app (PWA), the last good data and your preferences are saved on your device. Clearing your browser data removes them. There are no accounts, so there is nothing to delete server-side.</dd></div>
    <div><dt>Third-party services</dt><dd>The site relies on Cloudflare (hosting), Yahoo Finance, FRED, the Bank of Japan, the CFTC (market data) and Mistral AI (explanations). Their own terms and privacy policies apply to their services.</dd></div>
    <div><dt>The legal bit</dt><dd>Provided as it is, without warranties of any kind. As far as the law allows, we aren't liable for losses arising from your use of the app, and total liability is limited to what you paid us in the 12 months before the claim (so far, nothing). Governed by the laws of Singapore.</dd></div>
    <div><dt>Changes</dt><dd>If these terms change in a way that matters, the app will say so before it takes effect.</dd></div>
    <div><dt>Contact</dt><dd><a href="mailto:ethan@ethantam.dev">ethan@ethantam.dev</a></dd></div>
  </dl>
</section>

<section id="a-privacy" class="g-sec">
  <h3>Privacy</h3>
  <p>Equarian Markets has no user accounts, no sign-in and no analytics. This says what data touches the service and where it goes. The full text lives in <code>PRIVACY.md</code> in the repository.</p>
  <dl class="g-defs">
    <div><dt>What is collected</dt><dd>Nothing stored about you. The app doesn't ask for your name, email or any sign-in, and sets no tracking cookies. As an installable app (PWA), the last good market data is saved on your device so the dashboard opens instantly and still shows the last values offline; theme preferences and dismissed notices are saved locally too. Anyone who uses that browser can see this copy — clearing your browser data removes it.</dd></div>
    <div><dt>AI explanations (optional)</dt><dd>The "Explain in plain English" button sends only the indicator numbers shown on the page (never text you type) to a Mistral AI model through a Cloudflare Pages Function. The Function does not log or store the request.</dd></div>
    <div><dt>Who else processes data</dt><dd>Cloudflare (hosting and the serverless function); Yahoo Finance, FRED (St. Louis Fed), the Bank of Japan and the CFTC (market data); Mistral AI (only if you tap "Explain in plain English").</dd></div>
    <div><dt>What is not done</dt><dd>No ads, no analytics, no tracking pixels, no cross-site tracking. No selling or sharing of personal data (there isn't any to sell). No account system — there is nothing to delete, because nothing is stored about you server-side.</dd></div>
    <div><dt>Changes</dt><dd>If this policy changes in a way that matters, the app will say so before it takes effect.</dd></div>
    <div><dt>Contact</dt><dd><a href="mailto:ethan@ethantam.dev">ethan@ethantam.dev</a></dd></div>
  </dl>
</section>`;

let built = false;
function build() {
  if (built) return;
  built = true;
  $("aNav").innerHTML = SECTIONS.map(s => '<button type="button" data-sec="' + s.id + '">' + s.label + "</button>").join("");
  $("aBody").innerHTML = BODY();
  $("aNav").addEventListener("click", e => {
    const b = e.target.closest("button[data-sec]");
    if (b) goTo(b.dataset.sec);
  });
}

function goTo(id) {
  const el = $("a-" + id);
  if (!el) return;
  const dlg = $("api");
  dlg.scrollTo({ top: el.offsetTop - $("aNav").offsetHeight - 8, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

export function openApi(section) {
  build();
  const dlg = $("api");
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  if (section) requestAnimationFrame(() => goTo(section));
}

export function initApi() {
  const dlg = $("api");
  $("aClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-api]");
    if (b) openApi(b.dataset.api);
  });
  swipeToClose(dlg, [$("aGrab"), dlg.querySelector(".d-head")]);
}
