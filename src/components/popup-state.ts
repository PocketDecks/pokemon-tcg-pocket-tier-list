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
