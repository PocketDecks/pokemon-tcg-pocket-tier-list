
export const buildTiers = <T,>(items: T[], getScore: (item: T) => number) => {
    if (!items || items.length === 0) return [];

    const scores = items.map(getScore);
    const bestScore = Math.max(...scores);
    const worstScore = Math.min(...scores);
    const steps = (bestScore - worstScore) / 6;

    return [
        { label: "S", color: "var(--s)", data: items.filter((d) => getScore(d) >= bestScore - steps) },
        { label: "A", color: "var(--a)", data: items.filter((d) => getScore(d) < bestScore - steps && getScore(d) >= bestScore - steps * 2) },
        { label: "B", color: "var(--b)", data: items.filter((d) => getScore(d) < bestScore - steps * 2 && getScore(d) >= bestScore - steps * 3) },
        { label: "C", color: "var(--c)", data: items.filter((d) => getScore(d) < bestScore - steps * 3 && getScore(d) >= bestScore - steps * 4) },
        { label: "D", color: "var(--d)", data: items.filter((d) => getScore(d) < bestScore - steps * 4 && getScore(d) >= bestScore - steps * 5) },
        { label: "F", color: "var(--f)", data: items.filter((d) => getScore(d) < bestScore - steps * 5) },
    ];
};