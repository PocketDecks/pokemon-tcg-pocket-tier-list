import { describe, expect, it } from "vitest";
import archive from "../../../public/data/deck-archive.json";
import { cardHubFor, cardHubSlug } from "../card-hub";

describe("card archetype hubs", () => {
  it("links a card to the hub of the decks it leads", () => {
    expect(cardHubFor({ name: "Gengar ex", id: "a1-123" })).toBe("gengar-ex");
  });

  it("returns no hub for a card that leads no archived deck", () => {
    expect(cardHubFor({ name: "Serena's Choice", id: "c1-120" })).toBeNull();
  });

  it("derives the slug the archive uses for each lead card", () => {
    const leads = archive.filter((entry) => /^[^&]+-[A-Za-z0-9]+-\d+$/.test(entry.name));
    expect(leads.length).toBeGreaterThan(0);
    for (const entry of leads) {
      const match = entry.name.match(/^(.+)-([A-Za-z0-9]+-\d+)$/);
      expect(match).not.toBeNull();
      expect(cardHubSlug(match![1], match![2])).toBe(entry.hub);
    }
  });
});
