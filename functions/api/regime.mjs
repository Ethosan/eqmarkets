/* GET /api/regime — the growth × inflation macro regime, as the dashboard's
   regime card reads it: the quadrant, how confident the reading is, and how
   long the regime has held. Public, read-only, edge-cached. */
import { json, macroSnapshot, rateLimited, shapeRegime } from "./_macro.mjs";

export async function onRequestGet({ request }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (rateLimited(ip)) return json(429, { error: "busy" });
  try {
    const snap = await macroSnapshot();
    return json(200, { ...shapeRegime(snap.regime, snap.asOf, new Date(snap.at).toISOString()), stale: snap.stale });
  } catch {
    return json(503, { error: "unavailable" });
  }
}
