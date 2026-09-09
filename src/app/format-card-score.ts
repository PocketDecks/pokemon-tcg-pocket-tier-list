/** Card Score for display: a 0..1 strength ratio scaled to 0..10. */
export const formatCardScore = (strengthRatio: number): string =>
  (strengthRatio * 10).toFixed(1);
