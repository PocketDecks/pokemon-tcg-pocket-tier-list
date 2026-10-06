import { describe, expect, it } from "vitest";
import { buildExpansionPackData } from "../expansion-scores";

describe("buildExpansionPackData", () => {
  it("maps a single-pack set by its expansion name", () => {
    const [pack] = buildExpansionPackData(
      [
        { set: "b4a", pack: "Team Rocket's Ambition", score: 0.8 },
        { set: "b4a", pack: "Team Rocket's Ambition", score: 0.4 },
      ],
      [
        {
          id: "b4a",
          name: "Team Rocket's Ambition",
          packs: [
            {
              id: "b4a-booster",
              name: "Booster",
              image: "b4a.webp",
            },
          ],
        },
      ],
      1
    );

    expect(pack).toMatchObject({
      expansionId: "b4a",
      packId: "b4a-booster",
      packName: "Booster",
      packImage: "b4a.webp",
    });
    expect(pack.relativeScore).toBeCloseTo(0.6);
    expect(pack.totalScore).toBeCloseTo(1.2);
  });

  it("does not return packs without artwork or scored cards", () => {
    expect(
      buildExpansionPackData(
        [{ set: "a1", pack: "Pikachu", score: 0.5 }],
        [
          {
            id: "a1",
            name: "Genetic Apex",
            packs: [
              { id: "a1-pikachu", name: "Pikachu", image: "pikachu.webp" },
              { id: "a1-charizard", name: "Charizard", image: "charizard.webp" },
            ],
          },
          {
            id: "pa",
            name: "Promo-A",
            packs: [{ id: "pa-shop", name: "Shop", image: null }],
          },
        ],
        1
      )
    ).toEqual([
      {
        expansionId: "a1",
        packId: "a1-pikachu",
        packName: "Pikachu",
        packImage: "pikachu.webp",
        totalScore: 0.5,
        relativeScore: 0.5,
      },
    ]);
  });
});
