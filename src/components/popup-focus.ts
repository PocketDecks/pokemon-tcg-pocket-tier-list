export const OPEN_MODAL_SELECTOR = '[aria-modal="true"], dialog[open]';

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "details > summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const isRendered = (element: HTMLElement) =>
  typeof element.checkVisibility === "function"
    ? element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
    : element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";

const getFocusable = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isRendered);

export const focusFirst = (dialog: HTMLElement) => (getFocusable(dialog)[0] ?? dialog).focus();

// The consent banner and consent dialog from @c15t/react are modals that sit
// outside the popup and must stay reachable while it is open. A nested popup
// counts as another modal for its parent too.
const isOtherModal = (candidate: HTMLElement, dialog: HTMLElement) => !candidate.contains(dialog);

const otherModalAround = (target: EventTarget | null, dialog: HTMLElement) => {
  if (!(target instanceof Element)) return null;
  const modal = target.closest<HTMLElement>(OPEN_MODAL_SELECTOR);
  return modal && isOtherModal(modal, dialog) ? modal : null;
};

const otherModalFocusables = (dialog: HTMLElement, forward: boolean) => {
  const others = Array.from(document.querySelectorAll<HTMLElement>(OPEN_MODAL_SELECTOR)).filter(
    (candidate) => isOtherModal(candidate, dialog)
  );
  const following = others.filter(
    (candidate) => dialog.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING
  );
  const preceding = others.filter((candidate) => !following.includes(candidate));
  const ordered = forward
    ? [...following, ...preceding]
    : [...preceding.reverse(), ...following.reverse()];
  const modal = ordered.find((candidate) => getFocusable(candidate).length > 0);
  return modal ? getFocusable(modal) : [];
};

export const trapFocus = (dialog: HTMLElement, onEscape: () => void) => {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" && event.key !== "Tab") return;
    if (otherModalAround(document.activeElement, dialog)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }

    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    const inside = current instanceof Node && dialog.contains(current);

    const other = otherModalFocusables(dialog, !event.shiftKey);

    if (event.shiftKey && (!inside || current === first || current === dialog)) {
      event.preventDefault();
      (other[other.length - 1] ?? last).focus();
    } else if (!event.shiftKey && (!inside || current === last)) {
      event.preventDefault();
      (other[0] ?? first).focus();
    }
  };

  // Runs in the capture phase so it wins over the other modal's own trap,
  // which would wrap Tab inside that modal and never hand focus back.
  const handleBridgeBack = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const current = document.activeElement;
    const modal = otherModalAround(current, dialog);
    if (!modal || dialog.contains(modal)) return;
    const theirs = getFocusable(modal);
    if (current !== (event.shiftKey ? theirs[0] : theirs[theirs.length - 1])) return;
    const own = getFocusable(dialog);
    event.preventDefault();
    ((event.shiftKey ? own[own.length - 1] : own[0]) ?? dialog).focus();
    event.stopPropagation();
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (
      event.target instanceof Node &&
      !dialog.contains(event.target) &&
      !otherModalAround(event.target, dialog)
    ) {
      focusFirst(dialog);
    }
  };

  const pendingFocusChecks: ReturnType<typeof setTimeout>[] = [];
  const handleFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget !== null || !(event.target instanceof Node)) return;
    if (dialog.contains(event.target)) return;
    pendingFocusChecks.push(
      setTimeout(() => {
        const current = document.activeElement;
        if (current === null || current === document.body) focusFirst(dialog);
      }, 0)
    );
  };

  document.addEventListener("keydown", handleBridgeBack, true);
  document.addEventListener("keydown", handleKeyDown);
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);

  return () => {
    document.removeEventListener("keydown", handleBridgeBack, true);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    for (const timer of pendingFocusChecks) clearTimeout(timer);
  };
};

const PRESS_WINDOW_MS = 1000;
let lastPressed: { element: HTMLElement; at: number } | null = null;

export const trackPresses = () => {
  const remember = (event: PointerEvent) => {
    const element =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(FOCUSABLE_SELECTOR)
        : null;
    lastPressed = element ? { element, at: Date.now() } : null;
  };
  document.addEventListener("pointerdown", remember, true);
  return () => document.removeEventListener("pointerdown", remember, true);
};

// Safari does not focus a button when it is clicked, so the control under the
// most recent press stands in for the trigger when nothing holds focus.
export const takeTrigger = () => {
  const active = document.activeElement;
  const pressed =
    lastPressed && Date.now() - lastPressed.at <= PRESS_WINDOW_MS ? lastPressed.element : null;
  lastPressed = null;
  return active instanceof HTMLElement && active !== document.body ? active : pressed;
};
