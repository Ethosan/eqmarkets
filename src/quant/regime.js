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
    blurb: "Growth expectations up, inflation expectations down. Stocks and credit have usually done best.",
  },
  reflation: {
    label: "Reflation", growth: 1, inflation: 1,
    blurb: "Growth and inflation expectations both rising. Commodities and cyclical stocks have usually led; bonds lagged.",
  },
  stagflation: {
    label: "Stagflation", growth: -1, inflation: 1,
    blurb: "Growth falling while inflation rises. Stocks and bonds have usually both struggled; commodities and cash held up best.",
  },
  disinflation: {
    label: "Disinflationary slowdown", growth: -1, inflation: -1,
    blurb: "Growth and inflation both falling. Government bonds have usually done best.",
  },
};

export const quadrantOf = (g, i) => (g >= 0 ? (i >= 0 ? "reflation" : "goldilocks") : (i >= 0 ? "stagflation" : "disinflation"));

/* How far the point sits from the nearer axis. An average of 3 unit-variance
   scores has a standard deviation below 1, so 0.5 is a strong reading. */
export function confidenceOf(g, i) {
  const m = Math.min(Math.abs(g), Math.abs(i));
  return m >= 0.5 ? "clear" : m >= 0.2 ? "moderate" : "tentative";
}

/* Monday of the trading week a date belongs to. A bar dated Sunday is the
   evening open of the week ahead (CME Globex), so it belongs to that week. */
export function weekKey(d) {
  const t = new Date(d + "T00:00:00Z");
  if (t.getUTCDay() === 0) t.setUTCDate(t.getUTCDate() + 1);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/* Weekly regime with hysteresis. A macro regime is a slow thing, so:
   - each input is the average of its 3- and 6-month vol-scaled moves;
   - the regime is read once a week, on each week's last close, and only from
     weeks that are over: a week counts once `today` (New York date) is in a
     later week, so a live Friday price can never lock in a change;
   - it only changes after the new quadrant has held for `confirm` completed
     weeks in a row, and a reading within `band` of an axis counts as no
     evidence to cross it (a dead band, so scores hovering near zero can't
     flip it back and forth). The switch is dated to the first week of that
     run, and those weeks are shown in the new regime;
   - the starting regime also needs `confirm` steady weeks, so where the
     history window happens to begin matters as little as possible.

   inputs: [{ id, label, axis: "growth"|"inflation", sign, kind, ppy, series }]
   calendar: master list of ISO dates (e.g. ES sessions).
   today: ISO date in New York; defaults to the last calendar date, which
   leaves the latest week open.
   Returns null until both axes have at least minPerAxis inputs. */
export function regimeModel(inputs, calendar, {
  horizons = [63, 126], minPerAxis = 2, confirm = 3, band = 0.15, trailWeeks = 13, stripWeeks = 52, today = null,
} = {}) {
  const paths = inputs.map(inp => ({ ...inp, paths: horizons.map(h => scaledMovePath(inp.series, inp.kind, obsFor(h, inp.ppy))) }));
  /* An input's score on a date: the mean of its horizons, only once all exist. */
  const scoreAt = (p, d) => {
    const vs = p.paths.map(path => (path.dates.length ? asOf(path, d, 7) : null));
    return vs.every(v => v != null) ? p.sign * mean(vs) : null;
  };
  const history = { dates: [], growth: [], inflation: [] };
  for (const d of calendar) {
    const g = [], f = [];
    for (const p of paths) {
      const v = scoreAt(p, d);
      if (v != null) (p.axis === "growth" ? g : f).push(v);
    }
    if (g.length >= minPerAxis && f.length >= minPerAxis) {
      history.dates.push(d);
      history.growth.push(mean(g));
      history.inflation.push(mean(f));
    }
  }
  const n = history.dates.length;
  if (!n) return null;

  /* Weekly readings: the last session of each week, finished weeks only. */
  const weeks = [];
  history.dates.forEach((d, i) => {
    const k = weekKey(d);
    const w = { week: k, date: d, growth: history.growth[i], inflation: history.inflation[i], regime: null };
    if (weeks.length && weeks[weeks.length - 1].week === k) weeks[weeks.length - 1] = w; else weeks.push(w);
  });
  /* From Saturday on, the week just ended counts: treat Saturday like the Sunday after. */
  const t = today || history.dates[n - 1];
  const sat = new Date(t + "T00:00:00Z").getUTCDay() === 6;
  const nowWeek = weekKey(sat ? new Date(Date.parse(t) + 864e5).toISOString().slice(0, 10) : t);
  const complete = weeks.filter(w => w.week < nowWeek);

  /* Hysteresis over completed weeks. Before a regime is established, a
     quadrant needs `confirm` steady weeks (no dead band) to become the first. */
  let cur = null, since = null, cand = null, run = 0, runStart = -1;
  const switches = [];
  complete.forEach((w, i) => {
    let q;
    if (cur == null) q = quadrantOf(w.growth, w.inflation);
    else {
      const c = QUADRANTS[cur];
      const gs = Math.abs(w.growth) < band ? c.growth : Math.sign(w.growth) || c.growth;
      const fs = Math.abs(w.inflation) < band ? c.inflation : Math.sign(w.inflation) || c.inflation;
      q = quadrantOf(gs, fs);
    }
    if (q === cur) { cand = null; run = 0; }
    else if (q === cand) run++;
    else { cand = q; run = 1; runStart = i; }
    if (cand && run >= confirm) {
      if (cur != null) switches.push({ week: complete[runStart].week, from: cur, to: cand });
      cur = cand; since = complete[runStart].week;
      for (let j = runStart; j < i; j++) complete[j].regime = cur; /* backdate the run */
      cand = null; run = 0;
    }
    w.regime = cur;
  });

  /* The latest reading (this week so far) for the dot, the bars and confidence. */
  const growth = history.growth[n - 1], inflation = history.inflation[n - 1];
  const readingQuadrant = quadrantOf(growth, inflation);
  /* Fewer than `confirm` finished weeks: show the reading, marked provisional. */
  const provisional = cur == null;
  const quadrant = provisional ? readingQuadrant : cur;
  const weeksIn = provisional ? 0 : complete.filter(w => w.week >= since).length;
  const sinceStart = !provisional && !switches.length;
  const yearAgo = complete.length > 52 ? complete[complete.length - 52].week : complete[0]?.week ?? nowWeek;
  const switchesYear = switches.filter(s => s.week >= yearAgo).length;

  const last = history.dates[n - 1];
  const contributions = paths
    .map(p => {
      const v = scoreAt(p, last);
      return v == null ? null : { id: p.id, label: p.label, axis: p.axis, score: v };
    })
    .filter(Boolean);

  return {
    growth, inflation, quadrant, label: QUADRANTS[quadrant].label, provisional,
    confidence: confidenceOf(growth, inflation), readingQuadrant,
    since, sinceStart, weeksIn, switchesYear, switches, band,
    pending: !provisional && cand ? { quadrant: cand, label: QUADRANTS[cand].label, weeks: run, needed: confirm } : null,
    trail: complete.slice(-trailWeeks).map(w => ({ date: w.date, growth: w.growth, inflation: w.inflation })),
    strip: complete.filter(w => w.regime).slice(-stripWeeks).map(w => ({ week: w.week, regime: w.regime })),
    history, contributions,
  };
}
