import { OPEN_MODAL_SELECTOR } from "./popup-focus";
import { claimInert, releaseInert } from "./popup-state";

const hasOpenModal = (element: Element) =>
  element.matches(OPEN_MODAL_SELECTOR) || element.querySelector(OPEN_MODAL_SELECTOR) !== null;

export const makeOutsideInert = (target: Element) => {
  const claimed: Element[] = [];
  const chain = new Set<Element>([target]);
  const watched: Element[] = [];
  let node: Element = target;
  while (node.parentElement) {
    const parent: Element = node.parentElement;
    watched.push(parent);
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || hasOpenModal(sibling)) continue;
      claimInert(sibling);
      claimed.push(sibling);
    }
    chain.add(parent);
    node = parent;
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const removed of Array.from(record.removedNodes)) {
        const index = claimed.indexOf(removed as Element);
        if (index === -1) continue;
        releaseInert(removed as Element);
        claimed.splice(index, 1);
      }
      for (const added of Array.from(record.addedNodes)) {
        if (!(added instanceof Element) || chain.has(added) || added.contains(target)) continue;
        if (hasOpenModal(added)) continue;
        claimInert(added);
        claimed.push(added);
      }
    }
  });
  for (const parent of watched) observer.observe(parent, { childList: true });
  return () => {
    observer.disconnect();
    for (const element of claimed) releaseInert(element);
  };
};
