let openPopups = 0;
const idleCallbacks = new Set<() => void>();

export const acquirePopup = () => {
  openPopups += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openPopups -= 1;
    if (openPopups > 0) return;
    const callbacks = Array.from(idleCallbacks);
    idleCallbacks.clear();
    for (const callback of callbacks) callback();
  };
};

export const whenNoPopupOpen = (callback: () => void) => {
  if (openPopups === 0) {
    callback();
    return () => undefined;
  }
  idleCallbacks.add(callback);
  return () => {
    idleCallbacks.delete(callback);
  };
};

type InertClaim = { count: number; previous: string | null };

const inertClaims = new Map<Element, InertClaim>();

export const claimInert = (element: Element) => {
  const claim = inertClaims.get(element);
  if (claim) {
    claim.count += 1;
    return;
  }
  inertClaims.set(element, { count: 1, previous: element.getAttribute("inert") });
  element.setAttribute("inert", "");
};

export const releaseInert = (element: Element) => {
  const claim = inertClaims.get(element);
  if (!claim) return;
  claim.count -= 1;
  if (claim.count > 0) return;
  inertClaims.delete(element);
  if (claim.previous === null) element.removeAttribute("inert");
  else element.setAttribute("inert", claim.previous);
};

export const heldInertCount = () => inertClaims.size;

export const openPopupCount = () => openPopups;
