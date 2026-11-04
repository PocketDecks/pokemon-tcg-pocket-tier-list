import { describe, expect, it } from "vitest";
import { buildExpansionData, buildExpansionPackData, isSharedPack } from "../expansion-scores";

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

describe("buildExpansionData", () => {
  const expansion = (
    id: string,
    name: string,
    packs: { id: string; name: string; image: string | null }[]
  ) => ({ id, name, release_date: null, packs });

  it("averages every card of a multi-pack expansion once, shared cards included", () => {
    const [entry] = buildExpansionData(
      [
        { set: "a1", pack: "Charizard", score: 1 },
        { set: "a1", pack: "Mewtwo", score: 0.4 },
        { set: "a1", pack: "Pikachu", score: 0.6 },
        { set: "a1", pack: "Shared", score: 0.5 },
      ],
      [
        expansion("a1", "Genetic Apex", [
          { id: "a1-charizard", name: "Charizard", image: "charizard.webp" },
          { id: "a1-mewtwo", name: "Mewtwo", image: "mewtwo.webp" },
          { id: "a1-pikachu", name: "Pikachu", image: "pikachu.webp" },
        ]),
      ]
    );

    expect(entry.expansionId).toBe("a1");
    expect(entry.name).toBe("Genetic Apex");
    expect(entry.packImages).toEqual(["charizard.webp", "mewtwo.webp", "pikachu.webp"]);
    expect(entry.totalScore).toBeCloseTo(2.5);
    expect(entry.averageScore).toBeCloseTo(0.625);
  });

  it("ranks expansions by average score", () => {
    const result = buildExpansionData(
      [
        { set: "a1", pack: "Pikachu", score: 0.2 },
        { set: "a2", pack: "Dialga", score: 0.9 },
      ],
      [
        expansion("a1", "Genetic Apex", [{ id: "a1-pikachu", name: "Pikachu", image: "pikachu.webp" }]),
        expansion("a2", "Space-Time Smackdown", [{ id: "a2-dialga", name: "Dialga", image: "dialga.webp" }]),
      ]
    );

    expect(result.map((entry) => entry.expansionId)).toEqual(["a2", "a1"]);
  });

  it("excludes deluxe expansions", () => {
    expect(
      buildExpansionData(
        [
          { set: "a4b", pack: "Deluxe", score: 0.9 },
          { set: "b4b", pack: "Deluxe", score: 0.9 },
        ],
        [
          expansion("a4b", "Deluxe Pack: Mega", [{ id: "a4b-booster", name: "Booster", image: "a4b.webp" }]),
          expansion("b4b", "Deluxe Pack: Shiny", [{ id: "b4b-booster", name: "Booster", image: "b4b.webp" }]),
        ]
      )
    ).toEqual([]);
  });

  it("excludes an expansion with no positive score", () => {
    expect(
      buildExpansionData(
        [{ set: "a2a", pack: "Arceus", score: 0 }],
        [expansion("a2a", "Mythical Island", [{ id: "a2a-arceus", name: "Arceus", image: "arceus.webp" }])]
      )
    ).toEqual([]);
  });

  it("excludes an expansion with no pack artwork", () => {
    expect(
      buildExpansionData(
        [{ set: "pb", pack: "Booster", score: 0.5 }],
        [expansion("pb", "Promo-B", [{ id: "pb-booster", name: "Booster", image: null }])]
      )
    ).toEqual([]);
  });
});

describe("isSharedPack", () => {
  it("treats any pack name containing shared, in any case, as shared", () => {
    expect(isSharedPack("Shared(Genetic Apex)")).toBe(true);
    expect(isSharedPack("SHARED")).toBe(true);
    expect(isSharedPack("Charizard")).toBe(false);
  });
});
