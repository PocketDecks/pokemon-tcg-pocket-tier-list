import { describe, expect, it } from "vitest";
import enSeo from "../en_seo.json";
import jaSeo from "../ja_seo.json";

describe("expansion list copy describes both rankings", () => {
  it("says expansions are ranked by default and packs on the Packs toggle, in English", () => {
    const copy = enSeo.expansionList;
    expect(copy.valueHeading).toMatch(/expansion/i);
    expect(copy.valueBody).toMatch(/expansions are ranked by default/i);
    expect(copy.valueBody).toMatch(/Switch to Packs/);
    expect(copy.valueBody).toMatch(/shared cards/);
    expect(copy.worthIntro).toMatch(/expansions at the top/i);
  });

  it("keeps the fresh-collection and lower-tier points in English", () => {
    expect(enSeo.expansionList.worthIntro).toMatch(/fresh collection/);
    expect(enSeo.expansionList.worthIntro).toMatch(/lower tiers hold useful cards/);
  });

  it("mirrors both rankings in Japanese", () => {
    const copy = jaSeo.expansionList;
    expect(copy.valueHeading).toMatch(/拡張パック/);
    expect(copy.valueBody).toMatch(/拡張パック/);
    expect(copy.valueBody).toMatch(/ブースターパック/);
    expect(copy.valueBody).toMatch(/初期設定では、各拡張パック/);
    expect(copy.valueBody).toMatch(/「ブースターパック」に切り替えると/);
    expect(copy.valueBody).toMatch(/セット共通のカード/);
    expect(copy.worthIntro).toMatch(/拡張パック/);
  });
});
