export const deckNameToIconIds = (name: string): string[] =>
  name.split("&").map((cardName: string) => {
    const cardNameParts = cardName.split("-");
    return [
      cardNameParts[cardNameParts.length - 2],
      cardNameParts[cardNameParts.length - 1],
    ].join("-");
  });
