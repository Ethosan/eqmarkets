/* GET /api/risk — the Risk Appetite Index level (a σ reading with its label),
   as the dashboard's models panel reads it. Public, read-only, edge-cached. */
import { json, macroSnapshot, rateLimited, shapeRisk } from "./_macro.mjs";

export async function onRequestGet({ request }) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (rateLimited(ip)) return json(429, { error: "busy" });
  try {
    const snap = await macroSnapshot();
    return json(200, { ...shapeRisk(snap.rai, snap.asOf, new Date(snap.at).toISOString()), stale: snap.stale });
  } catch {
    return json(503, { error: "unavailable" });
  }
}
