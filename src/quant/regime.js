/* Growth × inflation regime, read from market prices.

   The four-quadrant framing follows Bridgewater's All Weather work and AQR's
   macro-sensitivity research (Ilmanen, Maloney & Ross 2014, JPM): asset returns
   depend mostly on whether growth and inflation are surprising up or down.
   Markets price those surprises first, so each axis is built from market moves,
   not from GDP or CPI releases, which arrive late and get revised.

   Each input is scored as a volatility-scaled change (Moskowitz, Ooi & Pedersen
   2012): the h-day move divided by the move you'd expect over h days given the
   volatility *before the window started*. Using ex-ante volatility stops a big
   move from inflating its own denominator. Scores are clipped to ±3 and averaged
   with equal weights per axis. */
import { asOf, clip, diffs, ewmaVolPath, logReturns, mean } from "./stats.js";

/* Path of vol-scaled h-observation changes.
   Prices: log change. Rates and levels: point change (normal vol).
   ewmaVolPath(steps)[k] is σ after step k, and step k runs from values[k] to
   values[k+1], so σ known at the window start values[i-h] is vol[i-h-1]. */
export function scaledMovePath({ dates, values }, kind, h) {
  const steps = kind === "price" ? logReturns(values) : diffs(values);
  const vol = ewmaVolPath(steps);
  const out = { dates: [], values: [] };
  for (let i = h + 1; i < values.length; i++) {
    const s = vol[i - h - 1];
    if (!(s > 0)) continue;
    const move = kind === "price" ? Math.log(values[i] / values[i - h]) : values[i] - values[i - h];
    out.dates.push(dates[i]);
    out.values.push(clip(move / (s * Math.sqrt(h)), -3, 3));
  }
  return out;
}

/* Observations in a calendar span for a market's trading frequency. */
export const obsFor = (tradingDays, ppy = 252) => Math.round(tradingDays * ppy / 252);

export const QUADRANTS = {
  goldilocks: {
    label: "Goldilocks", growth: 1, inflation: -1,
    blurb: "Growth expectations up, inflation expectations down. Historically the best mix for stocks and credit.",
  },
  reflation: {
    label: "Reflation", growth: 1, inflation: 1,
    blurb: "Growth and inflation expectations both rising. Commodities and cyclical stocks have tended to lead, bonds lag.",
  },
  stagflation: {
    label: "Stagflation", growth: -1, inflation: 1,
    blurb: "Growth falling while inflation rises. The hardest mix: stocks and bonds both struggle, commodities and cash have held up best.",
  },
  disinflation: {
    label: "Disinflationary slowdown", growth: -1, inflation: -1,
    blurb: "Growth and inflation both falling. High-quality government bonds have tended to do best.",
  },
};

export const quadrantOf = (g, i) => (g >= 0 ? (i >= 0 ? "reflation" : "goldilocks") : (i >= 0 ? "stagflation" : "disinflation"));

/* How far the point sits from the nearer axis. An average of 3 unit-variance
   scores has a standard deviation below 1, so 0.5 is a strong reading. */
export function confidenceOf(g, i) {
  const m = Math.min(Math.abs(g), Math.abs(i));
  return m >= 0.5 ? "clear" : m >= 0.2 ? "moderate" : "tentative";
}

const smoothAt = (arr, j, k) => mean(arr.slice(Math.max(0, j - k + 1), j + 1));

/* inputs: [{ id, label, axis: "growth"|"inflation", sign, kind, ppy, series }]
   calendar: master list of ISO dates (e.g. ES sessions).
   Returns null until both axes have at least minPerAxis inputs. */
export function regimeModel(inputs, calendar, { h = 63, minPerAxis = 2, days = 260, smooth = 5, trailWeeks = 13 } = {}) {
  const paths = inputs.map(inp => ({ ...inp, path: scaledMovePath(inp.series, inp.kind, obsFor(h, inp.ppy)) }));
  const cal = calendar.slice(-days);
  const history = { dates: [], growth: [], inflation: [] };
  for (const d of cal) {
    const g = [], f = [];
    for (const p of paths) {
      const v = p.path.dates.length ? asOf(p.path, d, 7) : null;
      if (v != null) (p.axis === "growth" ? g : f).push(p.sign * v);
    }
    if (g.length >= minPerAxis && f.length >= minPerAxis) {
      history.dates.push(d);
      history.growth.push(mean(g));
      history.inflation.push(mean(f));
    }
  }
  const n = history.dates.length;
  if (!n) return null;

  /* A 5-session mean for the label and the trail, so one day can't flip the regime. */
  const k = Math.min(smooth, n);
  const growth = smoothAt(history.growth, n - 1, k);
  const inflation = smoothAt(history.inflation, n - 1, k);
  const quadrant = quadrantOf(growth, inflation);

  let j = n - 1;
  while (j >= 0 && quadrantOf(smoothAt(history.growth, j, k), smoothAt(history.inflation, j, k)) === quadrant) j--;
  const since = history.dates[j + 1];
  const sinceStart = j < 0; /* the streak covers all the history we have */

  const trail = [];
  for (let t = n - 1; t >= 0 && trail.length < trailWeeks; t -= 5) {
    trail.unshift({ date: history.dates[t], growth: smoothAt(history.growth, t, k), inflation: smoothAt(history.inflation, t, k) });
  }

  const last = cal[cal.length - 1];
  const contributions = paths
    .map(p => {
      const v = p.path.dates.length ? asOf(p.path, last, 7) : null;
      return v == null ? null : { id: p.id, label: p.label, axis: p.axis, score: p.sign * v };
    })
    .filter(Boolean);

  return {
    growth, inflation, quadrant, label: QUADRANTS[quadrant].label,
    confidence: confidenceOf(growth, inflation), since, sinceStart, trail, history, contributions,
  };
}
