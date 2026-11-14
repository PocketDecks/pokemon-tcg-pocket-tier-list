import { createContext, useCallback, useMemo, useState, ReactNode } from "react";

interface MissingContextType {
  missing: string[];
  /// Copies marked missing per card id.
  missingCounts: Record<string, number>;
  addMissing: (ids: string[]) => void;
  canUndo: boolean;
  undoMissing: () => void;
  lastRemovedId: string | null;
}

export const MissingContext = createContext<MissingContextType>({
  missing: [],
  missingCounts: {},
  addMissing: () => {},
  canUndo: false,
  undoMissing: () => {},
  lastRemovedId: null,
});

interface Props {
  children: ReactNode;
}

const MissingContextProvider = ({ children }: Props) => {
  const [missing, setMissing] = useState<string[]>([]);
  // Each entry is one remove action (e.g. ["a1-001", "a1-001"] when both
  // copies of a card were cut). Undo pops the most recent batch.
  const [history, setHistory] = useState<string[][]>([]);

  const addMissing = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setMissing((prev) => [...prev, ...ids]);
    setHistory((prev) => [...prev, ids]);
  }, []);

  const undoMissing = useCallback(() => {
    if (history.length === 0) return;
    const lastBatch = history[history.length - 1];
    setMissing((prev) => {
      const next = [...prev];
      for (const id of lastBatch) {
        const index = next.lastIndexOf(id);
        if (index !== -1) next.splice(index, 1);
      }
      return next;
    });
    setHistory((prev) => prev.slice(0, -1));
  }, [history]);

  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of missing) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, [missing]);

  const lastBatch = history[history.length - 1];
  const lastRemovedId = lastBatch ? lastBatch[0] : null;

  const value = useMemo(
    () => ({
      missing,
      missingCounts,
      addMissing,
      canUndo: history.length > 0,
      undoMissing,
      lastRemovedId,
    }),
    [missing, missingCounts, history, addMissing, undoMissing, lastRemovedId]
  );

  return (
    <MissingContext.Provider value={value}>
      {children}
    </MissingContext.Provider>
  );
};

export default MissingContextProvider;