/* One-line plain-English read for each indicator. Returns { t, c } or null,
   where c is "" (neutral), "u" (supportive) or "d" (warning). */
import { ok } from "../state.js";

export function noteFor(item, s) {
  const pctCh = s.prev && s.price != null ? (s.price - s.prev) / s.prev * 100 : null;
  const v = s.price;
  switch (item.id) {
    case "us2y":
      if (!s.src) return null;
      return s.src === "fred"
        ? { t: "Fed H.15 daily close · cash market", c: "" }
        : { t: "Futures proxy · can drift from cash", c: "" };
    case "fedfunds":
      return s.src === "fred" ? { t: "NY Fed EFFR · official daily", c: "" } : null;
    case "boj": {
      const ff = ok("fedfunds");
      const gap = ff ? " · US-JP gap " + (ff.price - v).toFixed(2) + " pts" : "";
      const tag = s.src === "boj" ? "Live from boj.or.jp" : "Fallback value";
      return { t: tag + (s.asOf ? ", " + s.asOf : "") + gap, c: "" };
    }
    case "usdjpy":
      if (pctCh == null) return null;
      if (pctCh <= -0.7) return { t: "Yen surging · carry unwind risk", c: "d" };
      if (pctCh <= -0.3) return { t: "Yen bid", c: "" };
      if (pctCh >= 0.4) return { t: "Yen soft · carry supportive", c: "u" };
      return { t: "Carry steady", c: "" };
    case "jpycot":
      if (v < -100) return { t: "Extreme yen short · unwind fuel high", c: "d" };
      if (v < -25) return { t: "Crowded yen short · CFTC weekly", c: "" };
      if (v > 75) return { t: "Specs heavily long yen · carry unwound", c: "" };
      if (v > 25) return { t: "Specs long yen · CFTC weekly", c: "" };
      return { t: "Balanced positioning · CFTC weekly", c: "" };
    case "carryvol": {
      const parts = "gap " + (s.gap != null ? s.gap.toFixed(2) : "?") + "pp / 21d vol " + (s.vol != null ? s.vol.toFixed(1) : "?") + "%";
      if (v >= 0.5) return { t: "Fat carry per unit risk · " + parts, c: "u" };
      if (v >= 0.3) return { t: "Fair compensation · " + parts, c: "" };
      if (v >= 0.18) return { t: "Thin cushion · " + parts, c: "" };
      return { t: "Vol eating the carry · " + parts, c: "d" };
    }
    case "vix":
      if (v < 14) return { t: "Complacency zone", c: "u" };
      if (v < 20) return { t: "Normal chop", c: "" };
      if (v < 28) return { t: "Elevated stress", c: "" };
      return { t: "Panic conditions", c: "d" };
    case "spread":
      if (v < 0) return { t: "Inverted · classic recession warning", c: "d" };
      if (v < 25) return { t: "Barely positive · late-cycle shape", c: "" };
      return { t: "Positively sloped · curve behaving", c: "u" };
    case "hyg":
      if (pctCh == null) return null;
      if (pctCh <= -0.5) return { t: "Credit cracking today", c: "d" };
      if (pctCh <= -0.15) return { t: "Credit going soft", c: "" };
      if (pctCh >= 0.15) return { t: "Credit well bid", c: "u" };
      return { t: "Credit quiet", c: "" };
    case "hyoas":
      if (v < 3.2) return { t: "Tight · credit fully embraced", c: "u" };
      if (v < 4.5) return { t: "Normal range", c: "" };
      if (v < 6) return { t: "Widening · late-cycle caution", c: "" };
      return { t: "Stress territory", c: "d" };
    default:
      return null;
  }
}
