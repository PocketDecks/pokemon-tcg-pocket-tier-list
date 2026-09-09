import { Card } from "./types";

const formatName = (_cards: Card[], match: string[]): string => {
    return match
        .map((cardName) => {
            const cardNameParts = cardName.split(" ");
            const id = cardNameParts.pop() || "";
            const padded = id.padStart(3, "0");
            return [...cardNameParts, padded].join("-").toLowerCase();
        })
        .join("&");
};

// Joins match card names into a lowercase, zero-padded "&"-separated pairing slug.
export const formatMatch = (match: string[]): string => formatName([], match);

export default formatName;