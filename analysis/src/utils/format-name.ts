const formatName = (match: string[]): string => {
    return match
        .map((cardName) => {
            const cardNameParts = cardName.split(" ");
            const id = cardNameParts.pop() || "";
            const padded = id.padStart(3, "0");
            return [...cardNameParts, padded].join("-").toLowerCase();
        })
        .join("&");
};

export default formatName;
