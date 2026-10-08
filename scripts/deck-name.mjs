export const deckNameToIconIds = (name) =>
  name.split("&").flatMap((cardName) => {
    const cardNameParts = cardName.split("-");
    if (cardNameParts.length < 3) return [];
    return [[
      cardNameParts[cardNameParts.length - 2],
      cardNameParts[cardNameParts.length - 1],
    ].join("-")];
  });
