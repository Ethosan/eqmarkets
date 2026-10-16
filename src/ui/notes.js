/* One-line read per indicator: { t, c } with c "" (neutral), "u" (supportive)
   or "d" (warning). Definitional thresholds where the indicator has them
   (NFCI 0, VIX term structure 1, curve inversion); otherwise where the value
   sits in its own one-year distribution. */
import { ok } from "../state.js";
import { recessionProbability } from "../quant/models.js";
import { robustZ } from "../quant/stats.js";
import { ordinal } from "./format.js";

function rangeNote(item, st) {
  if (!st || st.pct1y == null) return null;
  const p = Math.round(st.pct1y * 100);
  const extreme = p >= 90 || p <= 10;
  const high = p >= 50;
  const tone = !extreme ? "" : (high !== !!item.invert ? "u" : "d");
  const where = p >= 90 ? "Top decile" : p <= 10 ? "Bottom decile" : ordinal(p) + " pct";
  return { t: where + " of 1Y range · z " + (st.z1y >= 0 ? "+" : "") + st.z1y.toFixed(1), c: tone };
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
      return { t: "Implies " + (recessionProbability(v) * 100).toFixed(0) + "% 12M recession odds (spot)" + (v < 0 ? " · inverted" : ""), c: v < 0 ? "d" : "" };
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
    case "us10y":
      return s.src === "fred" ? { t: "H.15 close · " + s.asOf, c: "" } : rangeNote(item, st);
    default:
      return rangeNote(item, st);
  }
}
