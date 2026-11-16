import type { WindowId } from "../../types/meta-windows";

export interface DeckRouteInput {
  deckId: string;
  status: "loading" | "ready" | "error";
  decks: readonly { id: string }[] | null;
  /** null while premium status is still being read. */
  isPremium: boolean | null;
  /** Windows that list this deck, empty when the deck is not Supporter-only. */
  premiumWindows: readonly WindowId[];
  /** The tier list window the viewer has selected. */
  window: WindowId;
  /** The deck id a window switch was already made for, if any. */
  switchedFor: string | null;
  /** Hub of the archive entry for this variant, null when the archive has no entry. */
  entryHub: string | null;
  /** Whether the archive lists any variant under this slug as its hub. */
  hubHasDecks: boolean;
}

export type DeckRouteKind = "skeleton" | "gate" | "detail" | "hub" | "redirect" | "not-found";

export interface DeckRouteDecision {
  kind: DeckRouteKind;
  /** Window to select before the deck can show. Set only when a switch is still pending. */
  switchTo: WindowId | null;
}

export const resolveDeckRoute = (input: DeckRouteInput): DeckRouteDecision => {
  const offered = input.decks?.some((deck) => deck.id === input.deckId) ?? false;
  const gated = input.premiumWindows.length > 0 && !offered;
  const needsSwitch =
    gated && input.isPremium === true && !input.premiumWindows.includes(input.window);
  const switchTo = needsSwitch && input.switchedFor !== input.deckId ? input.premiumWindows[0] : null;
  const decide = (kind: DeckRouteKind): DeckRouteDecision => ({ kind, switchTo });

  if (input.status === "loading") return decide("skeleton");

  if (gated) {
    if (input.isPremium === null || switchTo !== null) return decide("skeleton");
    if (input.isPremium === false || needsSwitch) return decide("gate");
  }

  if (input.decks === null) {
    if (input.entryHub !== null) return decide("detail");
    if (input.hubHasDecks) return decide("hub");
    return decide("not-found");
  }

  if (offered) return decide("detail");
  if (input.entryHub !== null && input.entryHub !== input.deckId) return decide("redirect");
  if (input.hubHasDecks) return decide("hub");
  return decide("not-found");
};
