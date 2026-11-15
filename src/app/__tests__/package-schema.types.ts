import { expectTypeOf } from "vitest";
import type { PokemonTCGPocketCardsV5CoreSchema } from "pokemon-tcg-pocket-cards/core";
import type { PokemonTCGPocketExpansionsV5Schema } from "pokemon-tcg-pocket-cards/expansions";
import type { RawCardType } from "../cards-api";
import type { ExpansionType, PackType } from "../use-expansions";
import type { RAW_CARDS, ALL_EXPANSIONS } from "../constants";

expectTypeOf<RawCardType>().toEqualTypeOf<PokemonTCGPocketCardsV5CoreSchema[number]>();
expectTypeOf<ExpansionType>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema[number]>();
expectTypeOf<PackType>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema[number]["packs"][number]>();
expectTypeOf<typeof RAW_CARDS>().toEqualTypeOf<PokemonTCGPocketCardsV5CoreSchema>();
expectTypeOf<typeof ALL_EXPANSIONS>().toEqualTypeOf<PokemonTCGPocketExpansionsV5Schema>();
