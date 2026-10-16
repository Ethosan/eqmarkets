import { STATE, ok, dayKey } from "../state.js";

/* 2s10s: 10Y minus 2Y, in basis points, with a matched daily history. */
function computeSpread() {
  const a = ok("us10y"), b = ok("us2y");
  if (!a || !b) { STATE.spread = { error: true }; return; }
  const closes = [], ts = [];
  if (a.ts && b.ts && a.closes && b.closes) {
    const twoY = new Map();
    b.ts.forEach((t, i) => twoY.set(dayKey(t), b.closes[i]));
    a.ts.forEach((t, i) => {
      const k = dayKey(t);
      if (twoY.has(k)) { closes.push((a.closes[i] - twoY.get(k)) * 100); ts.push(t); }
    });
  }
  const price = (a.price - b.price) * 100;
  const prev = a.prev != null && b.prev != null ? (a.prev - b.prev) * 100
    : closes.length > 1 ? closes[closes.length - 2] : null;
  STATE.spread = { price, prev, ts, closes, error: false };
}

/* Carry-to-vol: Fed-BOJ gap divided by 21-day realized USD/JPY vol (annualized, %). */
function computeCarry() {
  const j = ok("usdjpy"), ff = ok("fedfunds"), bj = ok("boj");
  if (!j || !j.closes || j.closes.length < 25 || !ff || !bj) { STATE.carryvol = { error: true }; return; }
  const c = j.closes.slice(-22);
  const rets = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mu = rets.reduce((x, y) => x + y, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((x, y) => x + (y - mu) * (y - mu), 0) / rets.length);
  const vol = sd * Math.sqrt(252) * 100;
  if (!vol || !isFinite(vol)) { STATE.carryvol = { error: true }; return; }
  const gap = ff.price - bj.price;
  STATE.carryvol = { price: gap / vol, prev: null, ts: null, closes: null, error: false, vol, gap };
}

export function computeDerived() {
  computeSpread();
  computeCarry();
}
