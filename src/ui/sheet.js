/* Bottom-sheet dialogs on phones: drag down from the handle or header to dismiss. */
export function swipeToClose(dlg, handles) {
  let y0 = null, dy = 0;
  const move = e => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    dlg.style.transform = "translateY(" + dy + "px)";
  };
  const end = () => {
    if (y0 == null) return;
    y0 = null;
    dlg.style.transition = "";
    dlg.style.transform = "";
    if (dy > 90) dlg.close();
  };
  for (const h of handles) {
    if (!h) continue;
    h.addEventListener("pointerdown", e => {
      if (e.pointerType === "mouse" || dlg.scrollTop > 0 || e.target.closest("button")) return;
      y0 = e.clientY; dy = 0;
      dlg.style.transition = "none";
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
