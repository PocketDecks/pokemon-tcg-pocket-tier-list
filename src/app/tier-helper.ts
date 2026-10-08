
const TIER_BANDS = [
    { label: "S", color: "var(--s)" },
    { label: "A", color: "var(--a)" },
    { label: "B", color: "var(--b)" },
    { label: "C", color: "var(--c)" },
    { label: "D", color: "var(--d)" },
    { label: "F", color: "var(--f)" },
];

export const TIER_COUNT = TIER_BANDS.length;

export const buildTiers = <T,>(items: T[], getScore: (item: T) => number) => {
    if (!items || items.length === 0) return [];

    const scores = items.map(getScore);
    const bestScore = Math.max(...scores);
    const worstScore = Math.min(...scores);
    const steps = (bestScore - worstScore) / TIER_COUNT;

    return TIER_BANDS.map(({ label, color }, index) => {
        const upper = index === 0 ? Infinity : bestScore - steps * index;
        const lower = index === TIER_COUNT - 1 ? -Infinity : bestScore - steps * (index + 1);
        return {
            label,
            color,
            data: items.filter((d) => getScore(d) < upper && getScore(d) >= lower),
        };
    });
};
