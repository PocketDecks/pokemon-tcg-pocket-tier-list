import { WindowId } from "../../../src/types/meta-windows";
import { buildDeckPopulation, buildWindowArtefacts, WindowArtefacts, WindowDecks } from "../utils/build-window-artefacts";
import { Deck } from "../utils/types";

export const windowArtefacts = (decks: Deck[], window: WindowId, today: Date): WindowArtefacts =>
  buildWindowArtefacts(buildDeckPopulation(decks, today), window);

export const windowDecks = (decks: Deck[], window: WindowId, today: Date): WindowDecks =>
  buildDeckPopulation(decks, today).windows[window];
