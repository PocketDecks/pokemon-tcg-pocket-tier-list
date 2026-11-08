import { expectTypeOf } from "vitest";
import type { PokemonTCGPocketCardsV5CoreSchema } from "pokemon-tcg-pocket-cards/core";
import type { PokemonTCGPocketExpansionsV5Schema } from "pokemon-tcg-pocket-cards/expansions";
import type { RawCardType } from "../cards-api";
import type { ExpansionType, PackType } from "../use-expansions";
import type { CARDS_URL, EXPANSIONS_URL } from "../constants";

expectTypeOf<RawCardType>().toEqualTypeOf<PokemonTCGPocketCardsV5CoreSchema[number]>();
expectTypeOf<ExpansionType>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema[number]>();
expectTypeOf<PackType>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema[number]["packs"][number]>();
expectTypeOf<typeof CARDS_URL>().toEqualTypeOf<PokemonTCGPocketCardsV5CoreSchema>();
expectTypeOf<typeof EXPANSIONS_URL>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema>();
