/* Bottom-sheet dialogs on phones: drag down from the handle or header to dismiss.
   The sheet follows the finger 1:1, resists when pulled up (rubber band), and on release
   projects the flick's momentum to decide close vs return. Both outcomes run on a spring
   that starts at the finger's speed, and the sheet can be grabbed again mid-flight.
   Desktop dialogs (and reduced motion) close at once, as before. */

const PHONE = "(max-width: 720px)";
const isSheet = () => matchMedia(PHONE).matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;

// where a flick would come to rest: Apple's deceleration projection (rate 0.998 = scroll feel)
const project = (v, rate = 0.998) => (v / 1000) * rate / (1 - rate);
// the further past the edge, the less the sheet follows
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/* Critically damped spring (no overshoot) from `from` to `to`, starting at velocity v0 px/s.
   response = seconds to settle, roughly. Returns a cancel function. */
function spring(from, to, v0, onFrame, onDone, response = 0.32) {
  const w = (2 * Math.PI) / response, c1 = from - to, c2 = v0 + w * c1;
  let raf, t0 = null;
  const step = now => {
    if (t0 == null) t0 = now;
    const t = (now - t0) / 1000, e = Math.exp(-w * t);
    const x = to + (c1 + c2 * t) * e;
    const v = (c2 - w * (c1 + c2 * t)) * e; // derivative of the offset
    if (Math.abs(x - to) < 0.5 && Math.abs(v) < 20) { onFrame(to); onDone?.(); return; }
    onFrame(x);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

const state = new WeakMap(); // dlg -> { y, cancel }
function st(dlg) {
  let s = state.get(dlg);
  if (!s) state.set(dlg, (s = { y: 0, cancel: null }));
  return s;
}
function setY(dlg, y) {
  st(dlg).y = y;
  dlg.style.transform = y ? `translateY(${y}px)` : "";
}
// the sheet's live on-screen offset (mid-entrance it comes from the CSS transition)
function liveY(dlg) {
  const m = getComputedStyle(dlg).transform;
  return m && m !== "none" ? new DOMMatrixReadOnly(m).m42 : 0;
}

/* Close a dialog: on phones the sheet slides down the way it came, at velocity v (px/s). */
export function closeSheet(dlg, v = 0) {
  const s = st(dlg);
  s.cancel?.();
  if (!dlg.open) return;
  if (!isSheet()) { dlg.close(); return; }
  const from = liveY(dlg);
  dlg.style.transition = "none";
  setY(dlg, from);
  const to = dlg.offsetHeight + 24;
  dlg.classList.add("closing"); // the scrim fades as the sheet leaves
  s.cancel = spring(from, to, Math.max(v, 600), y => setY(dlg, y), () => {
    s.cancel = null;
    dlg.close();
    setY(dlg, 0);
    dlg.style.transition = "";
  }, 0.28);
}

export function swipeToClose(dlg, handles) {
  // Esc also leaves the same way the sheet arrived
  dlg.addEventListener("cancel", e => { if (isSheet()) { e.preventDefault(); closeSheet(dlg); } });
  dlg.addEventListener("close", () => { const s = st(dlg); s.cancel?.(); s.cancel = null; setY(dlg, 0); dlg.style.transition = ""; dlg.classList.remove("closing"); });

  let y0 = null, base = 0, hist = [];
  const move = e => {
    if (y0 == null) return;
    const raw = base + e.clientY - y0;
    setY(dlg, raw < 0 ? rubberband(raw, dlg.offsetHeight) : raw);
    hist.push([e.timeStamp, e.clientY]);
    if (hist.length > 6) hist.shift();
  };
  const end = e => {
    if (y0 == null) return;
    y0 = null;
    // velocity at the moment of release, over the last ~100 ms (a finger held still before
    // letting go has no speed left)
    hist.push([e.timeStamp, e.clientY]);
    const now = hist[hist.length - 1], old = hist.find(p => now[0] - p[0] < 100);
    const v = old && now[0] > old[0] ? ((now[1] - old[1]) / (now[0] - old[0])) * 1000 : 0;
    const y = st(dlg).y, h = dlg.offsetHeight;
    // decide by where the gesture is going, not where it stopped; an upward flick never closes
    if (v > -100 && y + project(v) > Math.min(h * 0.4, 260)) closeSheet(dlg, v);
    else {
      const s = st(dlg);
      s.cancel = spring(y, 0, v, yy => setY(dlg, yy), () => { s.cancel = null; dlg.style.transition = ""; });
    }
  };
  for (const h of handles) {
    if (!h) continue;
    h.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" || !isSheet() || dlg.scrollTop > 0 || e.target.closest("button")) return;
      const s = st(dlg);
      // grab it mid-flight: stop whatever it was doing and start from where it is on screen
      s.cancel?.(); s.cancel = null; dlg.classList.remove("closing");
      dlg.style.transition = "none";
      base = liveY(dlg);
      setY(dlg, base);
      y0 = e.clientY; hist = [[e.timeStamp, e.clientY]];
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", end);
    h.addEventListener("pointercancel", end);
    /* touch-action: none still lets Chrome start a fling on a fast flick; once the
       sheet closes, that fling eats the next tap on a card. */
    h.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  }
}
