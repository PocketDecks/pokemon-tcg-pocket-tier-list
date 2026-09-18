export const DELTA_EPSILON = 0.001;

export type DeltaTrend = "up" | "down" | "flat";

export const deltaTrend = (delta: number | null): DeltaTrend => {
  if (delta === null || Math.abs(delta) <= DELTA_EPSILON) return "flat";
  return delta > 0 ? "up" : "down";
};
