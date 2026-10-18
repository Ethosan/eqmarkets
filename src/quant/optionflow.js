/* Option-flow analytics from the CBOE delayed SPX options chain
   (https://cdn-api.cboe.com/api/global/delayed_quotes/options/_SPX.json).
   Pure functions on plain objects, unit tested in tests/optionflow.test.js.

   What is estimated, and from what:
   - Net dealer gamma exposure (GEX): how many dollars of S&P futures dealers
     have to buy or sell per 1% move in the index, under the usual naive
     positioning assumption (customers buy puts and sell covered calls, so
     dealers are long call gamma and short put gamma). Positive GEX = dealer
     hedging sells rallies and buys dips, damping moves; negative = dealers
     must chase the move, amplifying it (SqueezeMetrics-style dealer
     positioning; Naib, Ospina & Shalen 2020s practitioner literature).
   - Gamma profile: the same net gamma recomputed with a Black–Scholes gamma
     at a grid of index levels, holding each option's quoted IV fixed. Where
     it crosses zero is the "gamma flip" level: below it dealer hedging
     typically turns pro-cyclical.
   - Walls: the strikes with the largest call open interest, put open interest
     and |gamma × OI| — levels the hedging flow gravitates to.
   - Put/call ratios on the day's SPX volume and open interest, and the share
     of volume in same-day and same-week expiries (0DTE flow).

   Caveats: delayed quotes (15 min), open interest from the previous session,
   the naive dealer-positioning assumption, and IV held fixed across the
   profile grid. This is context, not advice. */

export const CONTRACT_MULTIPLIER = 100;

/* Standard normal density. */
const npdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

/* Black–Scholes gamma per share. T in years, vol and r as decimals. */
export function bsGamma(S, K, T, vol, r = 0.04, q = 0) {
  const v = Math.max(vol, 1e-4) * Math.sqrt(T);
  if (!(v > 0)) return 0;
  const d1 = (Math.log(S / K) + (r - q + vol * vol / 2) * T) / v;
  return Math.exp(-q * T) * npdf(d1) / (S * v);
}

/* Option symbol, e.g. SPX261120C07655000 or SPXW261020P07650000. */
export function parseOptionSymbol(sym) {
  const m = /^SPXW?(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  return { expiry: `20${m[1]}-${m[2]}-${m[3]}`, type: m[4], strike: parseInt(m[5], 10) / 1000 };
}

const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

/* Raw chain JSON → { asOf, spot, iv30, options: [{strike, type, expiry, dte, gamma, iv, oi, vol}], skipped }.
   `now` (ISO date) overrides the chain's own timestamp date. */
export function parseChain(json, now = null) {
  const d = json?.data;
  if (!d?.options?.length || !(d.current_price > 0)) return null;
  const asOf = now || String(json.timestamp || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  const options = [];
  let skipped = 0;
  for (const o of d.options) {
    const p = parseOptionSymbol(o.option);
    if (!p || !isFinite(o.open_interest) || !isFinite(o.gamma)) { skipped++; continue; }
    options.push({
      ...p, dte: days(asOf, p.expiry),
      gamma: o.gamma, iv: isFinite(o.iv) ? o.iv : null,
      oi: o.open_interest, vol: isFinite(o.volume) ? o.volume : 0,
    });
  }
  if (options.length < 2) return null;
  return { asOf, spot: d.current_price, iv30: d.iv30 ?? null, options, skipped };
}

/* Net dealer gamma from the chain's own gamma values, at the current spot.
   Dollars per 1% move; calls positive, puts negative (naive assumption). */
export function netGex(options, spot) {
  let call = 0, put = 0;
  for (const o of options) {
    const g = o.gamma * o.oi * CONTRACT_MULTIPLIER * spot * spot * 0.01;
    if (o.type === "C") call += g; else put += g;
  }
  const net = call - put;
  return { net, call, put, netBn: net / 1e9, callBn: call / 1e9, putBn: put / 1e9 };
}

/* Net gamma per 1% move at a grid of index levels, holding quoted IVs fixed.
   Only options within `maxDte` days and `strikeBand` of spot: far strikes add
   no gamma. Returns nulls if nothing qualifies. */
export function gexProfile(chain, {
  lo = 0.82, hi = 1.18, steps = 145, r = 0.04, q = 0.0125, maxDte = 126, strikeBand = 0.3, minT = 0.5 / 365,
} = {}) {
  const { spot, options } = chain;
  const opts = options.filter(o => o.dte <= maxDte && Math.abs(o.strike / spot - 1) <= strikeBand && o.iv > 0);
  if (!opts.length) return null;
  const spots = Array.from({ length: steps }, (_, i) => spot * (lo + (hi - lo) * i / (steps - 1)));
  const values = spots.map(S => {
    let net = 0;
    for (const o of opts) {
      const T = Math.max(minT, o.dte / 365);
      const g = bsGamma(S, o.strike, T, o.iv, r, q) * o.oi * CONTRACT_MULTIPLIER * S * S * 0.01;
      net += o.type === "C" ? g : -g;
    }
    return net / 1e9;
  });
  /* The zero crossing closest to today's spot: the flip between dealer
     hedging that leans with the move and hedging that leans against it. */
  let flip = null;
  for (let i = 1; i < values.length; i++) {
    if ((values[i - 1] < 0 && values[i] >= 0) || (values[i - 1] >= 0 && values[i] < 0)) {
      const t = values[i - 1] / (values[i - 1] - values[i]);
      const x = spots[i - 1] + t * (spots[i] - spots[i - 1]);
      if (flip == null || Math.abs(x - spot) < Math.abs(flip - spot)) flip = x;
    }
  }
  return { spots, values, flip };
}

/* Walls: largest call OI, put OI and |gamma × OI| by strike. */
export function walls(options, spot) {
  const by = new Map();
  for (const o of options) {
    if (Math.abs(o.strike / spot - 1) > 0.25) continue;
    const w = by.get(o.strike) || { strike: o.strike, callOi: 0, putOi: 0, g: 0 };
    if (o.type === "C") w.callOi += o.oi; else w.putOi += o.oi;
    w.g += (o.type === "C" ? 1 : -1) * Math.abs(o.gamma) * o.oi;
    by.set(o.strike, w);
  }
  const list = [...by.values()];
  if (!list.length) return null;
  const maxBy = (key, sel) => list.reduce((a, b) => (sel(b) > sel(a) ? b : a));
  return {
    call: maxBy("callOi", w => w.callOi),
    put: maxBy("putOi", w => w.putOi),
    gamma: maxBy("g", w => Math.abs(w.g)),
  };
}

/* Put/call ratios and expiry concentration of today's trading. */
export function putCallFlow(options) {
  let callVol = 0, putVol = 0, callOi = 0, putOi = 0, d0 = 0, w0 = 0, totVol = 0;
  for (const o of options) {
    totVol += o.vol;
    if (o.type === "C") { callVol += o.vol; callOi += o.oi; } else { putVol += o.vol; putOi += o.oi; }
    if (o.dte <= 1) d0 += o.vol;
    else if (o.dte <= 7) w0 += o.vol;
  }
  return {
    callVol, putVol, callOi, putOi,
    pcVol: callVol > 0 ? putVol / callVol : null,
    pcOi: callOi > 0 ? putOi / callOi : null,
    d0Share: totVol > 0 ? d0 / totVol : null,
    weekShare: totVol > 0 ? (d0 + w0) / totVol : null,
    totalVol: totVol,
  };
}

/* Everything the option-flow card shows, from one parsed chain. */
export function optionFlow(chain, { r = 0.04 } = {}) {
  if (!chain) return null;
  const gex = netGex(chain.options, chain.spot);
  const profile = gexProfile(chain, { r });
  const w = walls(chain.options, chain.spot);
  const pc = putCallFlow(chain.options);
  /* Net gamma by expiry bucket, in $bn per 1%. */
  const buckets = [[0, 1], [2, 7], [8, 30], [31, 90], [91, Infinity]];
  const byDte = buckets.map(([a, b]) => {
    let net = 0;
    for (const o of chain.options) if (o.dte >= a && o.dte <= b)
      net += (o.type === "C" ? 1 : -1) * o.gamma * o.oi * CONTRACT_MULTIPLIER * chain.spot * chain.spot * 0.01;
    return { from: a, to: b, gexBn: net / 1e9 };
  });
  return { asOf: chain.asOf, spot: chain.spot, iv30: chain.iv30, gex, profile, walls: w, pc, byDte };
}
