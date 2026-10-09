import { describe, expect, it } from "vitest";
import { buildExpansionPackData } from "../expansion-scores";

describe("buildExpansionPackData", () => {
  it("maps a single-pack set by its expansion name", () => {
    const packs = buildExpansionPackData(
      [
        { set: "b4a", pack: "Team Rocket's Ambition", score: 0.8 },
        { set: "b4a", pack: "Team Rocket's Ambition", score: 0.4 },
        { set: "a1", pack: "Pikachu", score: 0.7 },
      ],
      [
        {
          id: "b4a",
          name: "Team Rocket's Ambition",
          release_date: null,
          packs: [
            {
              id: "b4a-booster",
              name: "Booster",
              image: "b4a.webp",
            },
          ],
        },
        {
          id: "a1",
          name: "Genetic Apex",
          release_date: null,
          packs: [
            {
              id: "a1-pikachu",
              name: "Pikachu",
              image: "pikachu.webp",
            },
          ],
        },
      ],
    );

    expect(packs.map((pack) => pack.packId)).toEqual([
      "a1-pikachu",
      "b4a-booster",
    ]);
    expect(packs[1].totalScore).toBeCloseTo(1.2);
    expect(packs[1].averageScore).toBeCloseTo(0.6);
  });

  it("does not return packs without artwork or scored cards", () => {
    expect(
      buildExpansionPackData(
        [{ set: "a1", pack: "Pikachu", score: 0.5 }],
        [
          {
            id: "a1",
            name: "Genetic Apex",
            release_date: null,
            packs: [
              { id: "a1-pikachu", name: "Pikachu", image: "pikachu.webp" },
              { id: "a1-charizard", name: "Charizard", image: "charizard.webp" },
            ],
          },
          {
            id: "pa",
            name: "Promo-A",
            release_date: null,
            packs: [{ id: "pa-shop", name: "Shop", image: null }],
          },
        ]
      )
    ).toEqual([
      {
        expansionId: "a1",
        packId: "a1-pikachu",
        packName: "Pikachu",
        packImage: "pikachu.webp",
        totalScore: 0.5,
        averageScore: 0.5,
      },
    ]);
  });
});
