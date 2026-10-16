/* FOMC statement days read from the Fed's own calendar page, so new years and
   reschedules show up without a code change. Cached on the device for a week;
   the built-in list in src/quant/calendar.js covers the gap if the Fed's site
   can't be reached. */
import { parseFomcCalendar, useFomcDates } from "../quant/calendar.js";
import { viaTransports } from "./transport.js";

const KEY = "eqm.fomc";
const TTL = 7 * 864e5;
const URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";

/* source: "built-in" until a load succeeds, then "federalreserve.gov". */
export const FOMC_STATE = { source: "built-in", checked: null };

export async function loadFomc() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || "null");
    if (c && Date.now() - c.ts < TTL && useFomcDates(c.dates)) {
      Object.assign(FOMC_STATE, { source: "federalreserve.gov", checked: c.ts });
      return true;
    }
  } catch { /* storage blocked or bad JSON */ }
  const dates = await viaTransports(URL, async r => {
    const d = parseFomcCalendar(await r.text());
    return d.length >= 8 ? d : null;
  }, 12000);
  if (!dates || !useFomcDates(dates)) return false;
  Object.assign(FOMC_STATE, { source: "federalreserve.gov", checked: Date.now() });
  try { localStorage.setItem(KEY, JSON.stringify({ ts: Date.now(), dates })); } catch { /* storage blocked */ }
  return true;
}
