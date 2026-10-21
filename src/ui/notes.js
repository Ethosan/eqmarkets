/* One-line read per indicator: { t, c } with c "" (neutral), "u" (supportive)
   or "d" (warning). Definitional thresholds where the indicator has them
   (NFCI 0, VIX term structure 1, curve inversion); otherwise where the value
   sits in its own one-year distribution. */
import { ok } from "../state.js";
import { recessionProbability } from "../quant/models.js";
import { percentileRank, robustZ } from "../quant/stats.js";
import { ordinal } from "./format.js";

function rangeNote(item, st) {
  if (!st || st.pct1y == null) return null;
  const p = Math.round(st.pct1y * 100);
  const extreme = p >= 90 || p <= 10;
  const high = p >= 50;
  const tone = !extreme ? "" : (high !== !!item.invert ? "u" : "d");
  const where = p >= 90 ? "Top decile" : p <= 10 ? "Bottom decile" : ordinal(p) + " pctile";
  const z = st.z1y == null ? "" : " · z\u00a0" + (st.z1y >= 0 ? "+" : "−") + Math.abs(st.z1y).toFixed(1);
  return { t: where + " (1Y)" + z, c: tone };
}

/* Where the latest value sits in the series' whole history (Baa: since 1986). */
export function longRunPct(s) {
  return s && s.values && s.values.length > 2000 ? percentileRank(s.values[s.values.length - 1], s.values.slice(0, -1)) : null;
}

export function noteFor(item, s, st) {
  const v = s.price;
  switch (item.id) {
    case "boj": {
      const ff = ok("fedfunds");
      const gap = ff ? " · US–JP gap " + (ff.price - v).toFixed(2) + " pp" : "";
      return { t: (s.src === "boj" ? "Live from boj.or.jp" : "Fallback value") + (s.asOf ? ", " + s.asOf : "") + gap, c: "" };
    }
    case "carryvol":
      return {
        t: `gap ${s.gap.toFixed(2)} pp ÷ EWMA vol ${s.vol.toFixed(1)}%` + (v >= 0.5 ? " · rich" : v < 0.2 ? " · vol eating carry" : ""),
        c: v >= 0.5 ? "u" : v < 0.2 ? "d" : "",
      };
    case "spread":
      return v < 0 ? { t: "Inverted · " + (rangeNote(item, st)?.t || ""), c: "d" } : rangeNote(item, st);
    case "spread3m":
      return { t: (recessionProbability(v) * 100).toFixed(0) + "% recession odds (spot)" + (v < 0 ? " · inverted" : ""), c: v < 0 ? "d" : "" };
    case "vixts":
      if (v >= 1) return { t: "Backwardation · near-term fear above 3M", c: "d" };
      if (v < 0.9) return { t: "Steep contango · calm regime", c: "u" };
      return { t: "Mild contango", c: "" };
    case "nfci":
      return { t: (v > 0 ? "Tighter" : "Looser") + " than average · as of " + s.asOf, c: v > 0 ? "d" : "u" };
    case "stlfsi":
      return { t: (v > 0 ? "Above-average" : "Below-average") + " stress · as of " + s.asOf, c: v > 0 ? "d" : "u" };
    case "jpycot": {
      const z = s.values && s.values.length >= 20 ? robustZ(v, s.values) : null;
      return { t: "Positioning z " + (z == null ? "n/a" : (z >= 0 ? "+" : "−") + Math.abs(z).toFixed(1)) + " vs 3Y · as of " + s.asOf, c: z != null && z < -1.5 ? "d" : "" };
    }
    case "us2y":
      if (s.src === "yahoo") return { t: "Futures proxy (2YY=F) · can drift from cash", c: "" };
      return s.src === "fred" ? { t: "H.15 close · " + s.asOf, c: "" } : rangeNote(item, st);
    case "us10y":
      return s.src === "fred" ? { t: "H.15 close · " + s.asOf, c: "" } : rangeNote(item, st);
    case "baa": {
      const lr = longRunPct(s), y = st?.pct1y;
      if (lr == null) return rangeNote(item, st);
      const p = Math.round(lr * 100);
      return { t: ordinal(p) + " pctile since " + item.longRun + (y == null ? "" : " · " + ordinal(Math.round(y * 100)) + " over 1Y"), c: p >= 80 ? "d" : p <= 20 ? "u" : "" };
    }
    case "hyoas": {
      /* FRED holds three years of the ICE series, so its own percentile is a
         recent-years view; the Baa spread says whether that is wide for real. */
      const r = rangeNote(item, st), lr = longRunPct(ok("baa"));
      if (lr == null || !r) return r;
      const p = Math.round(lr * 100);
      const word = p >= 80 ? "wide" : p <= 30 ? "tight" : "normal";
      return { t: r.t.replace(/ · z.*$/, "") + " · long run " + word + " (Baa " + ordinal(p) + ")", c: word === "tight" ? "" : r.c };
    }
    default:
      return rangeNote(item, st);
  }
}
