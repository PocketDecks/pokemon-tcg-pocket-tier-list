import { EXPANSIONS_URL } from "../constants";
import type { ExpansionType, PackType } from "../use-expansions";

type ExpansionFixture = Omit<Partial<ExpansionType>, "packs"> & {
  packs?: Partial<PackType>[];
};

export const expansionFixture = ({ packs = EXPANSIONS_URL[0].packs, ...fields }: ExpansionFixture): ExpansionType => {
  const [first, ...rest] = packs;
  if (!first) throw new Error("An expansion fixture needs a pack");
  const pack = (value: Partial<PackType>): PackType => ({
    ...EXPANSIONS_URL[0].packs[0],
    image_png: null,
    ...value,
  });
  return { ...EXPANSIONS_URL[0], ...fields, packs: [pack(first), ...rest.map(pack)] };
};
