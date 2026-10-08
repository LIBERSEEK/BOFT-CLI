/**
 * Keep a text selection from pulling the settings page upward.
 *
 * The Agent inspector is position: sticky. Chromium's selection gesture
 * scrolls that sticky block back toward its static position on pointerup,
 * so a line the user just selected jumps out from under the pointer.
 */

const SELECTION_CONTROL_SELECTOR = "button, a, input, textarea, select, label";

export function upwardScrollTop(saved: number, current: number): number {
  return current < saved ? saved : current;
}

function isPrimaryPointer(event: Event): event is MouseEvent {
  return "button" in event && (event as MouseEvent).button === 0;
}

function canScrollVertically(element: HTMLElement): boolean {
  if (element.scrollHeight <= element.clientHeight + 1) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const overflow = view.getComputedStyle(element).overflowY;
  return overflow === "auto" || overflow === "scroll" || overflow === "overlay";
}

function verticalScrollers(target: Element, page: HTMLElement): HTMLElement[] {
  const scrollers: HTMLElement[] = [];
  let node: Element | null = target;
  while (node) {
    if (node instanceof HTMLElement && canScrollVertically(node)) scrollers.push(node);
    if (node === page) break;
    node = node.parentElement;
  }
  if (!scrollers.includes(page) && canScrollVertically(page)) scrollers.push(page);
  return scrollers;
}

function pointerOnScrollbar(
  target: EventTarget | null,
  scroller: HTMLElement,
  event: MouseEvent,
): boolean {
  return target === scroller && event.offsetX >= scroller.clientWidth;
}

export function keepPageStillDuringTextSelection(region: HTMLElement): void {
  const view = (): Window | null => region.ownerDocument.defaultView;
  let session: {
    tops: Map<HTMLElement, number>;
    frame: number;
    framesLeft: number;
    onScroll: () => void;
    onPointerUp: () => void;
    onCancel: () => void;
    onWheel: () => void;
  } | null = null;

  const detach = (): void => {
    if (!session) return;
    const document = region.ownerDocument;
    for (const scroller of session.tops.keys()) {
      scroller.removeEventListener("scroll", session.onScroll);
    }
    document.removeEventListener("pointerup", session.onPointerUp);
    document.removeEventListener("pointercancel", session.onCancel);
    document.removeEventListener("wheel", session.onWheel);
    if (session.frame) view()?.cancelAnimationFrame(session.frame);
    session = null;
  };

  let restoring = false;
  const restore = (): void => {
    if (!session || restoring) return;
    restoring = true;
    try {
      for (const [scroller, top] of session.tops) {
        const next = upwardScrollTop(top, scroller.scrollTop);
        if (next !== scroller.scrollTop) scroller.scrollTop = next;
        else if (scroller.scrollTop > top) session.tops.set(scroller, scroller.scrollTop);
      }
    } finally {
      restoring = false;
    }
  };

  region.addEventListener("pointerdown", (event) => {
    if (!isPrimaryPointer(event)) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest(SELECTION_CONTROL_SELECTOR)) return;
    const page = region.closest(".settings-page");
    if (!(page instanceof HTMLElement)) return;
    detach();
    const tops = new Map<HTMLElement, number>();
    for (const scroller of verticalScrollers(target, page)) {
      if (pointerOnScrollbar(target, scroller, event)) continue;
      tops.set(scroller, scroller.scrollTop);
    }
    if (tops.size === 0) return;

    const onScroll = (): void => restore();
    const onPointerUp = (): void => {
      restore();
      if (!session) return;
      session.framesLeft = 2;
      const finish = (): void => {
        if (!session) return;
        restore();
        session.framesLeft -= 1;
        const owner = view();
        if (session.framesLeft > 0 && owner?.requestAnimationFrame) {
          session.frame = owner.requestAnimationFrame(finish);
          return;
        }
        detach();
      };
      const owner = view();
      if (owner?.requestAnimationFrame) session.frame = owner.requestAnimationFrame(finish);
      else detach();
    };
    const onCancel = (): void => detach();
    const onWheel = (): void => detach();
    session = { tops, frame: 0, framesLeft: 0, onScroll, onPointerUp, onCancel, onWheel };
    const document = region.ownerDocument;
    for (const scroller of tops.keys()) scroller.addEventListener("scroll", onScroll);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("wheel", onWheel, { passive: true });
  });
}
