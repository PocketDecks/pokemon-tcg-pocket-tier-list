export const deckNameToIconIds = (name) =>
  name.split("&").map((cardName) => {
    const cardNameParts = cardName.split("-");
    return [
      cardNameParts[cardNameParts.length - 2],
      cardNameParts[cardNameParts.length - 1],
    ].join("-");
  });
