import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { DECK_ARCHIVE, archiveForHub } from "../../app/deck-archive";
import { deckSlug } from "../../app/deck-slug";
import { premiumWindowsForSlug } from "../../app/premium-deck-slugs";
import { useDecks } from "../../app/use-decks";
import { useMetaWindow } from "../../app/use-meta-window";
import { useLocaleHref } from "../../app/locale-link";
import DeckDetailPage from "./DeckDetailPage";
import DeckHubPage from "./DeckHubPage";
import DeckPageSkeleton from "./DeckPageSkeleton";
import DeckPremiumGate from "./DeckPremiumGate";
import NotFoundPage from "../not-found/NotFoundPage";

const DeckRoute = () => {
  const { deckId = "" } = useParams();
  const { decks, loading, isPremium } = useDecks();
  const { window, setWindow } = useMetaWindow();
  const [switchedFor, setSwitchedFor] = useState<string | null>(null);
  const entry = DECK_ARCHIVE.find((candidate) => candidate.variant === deckId);
  const hubHref = useLocaleHref(`/deck/${entry?.hub ?? ""}`);
  const premiumWindows = premiumWindowsForSlug(deckId);
  const offered = decks?.some((deck) => deckSlug(deck.name) === deckId) ?? false;
  const needsSwitch =
    premiumWindows.length > 0 && !offered && isPremium === true && !premiumWindows.includes(window);
  const awaitingSwitch = needsSwitch && switchedFor !== deckId;

  useEffect(() => {
    if (!awaitingSwitch) return;
    setSwitchedFor(deckId);
    setWindow(premiumWindows[0]);
  }, [awaitingSwitch, deckId, premiumWindows, setWindow]);

  if (loading) return <DeckPageSkeleton />;
  if (premiumWindows.length > 0 && !offered) {
    if (isPremium === null || awaitingSwitch) return <DeckPageSkeleton />;
    if (isPremium === false || needsSwitch) return <DeckPremiumGate />;
  }
  if (!decks) {
    if (entry) return <DeckDetailPage />;
    if (archiveForHub(deckId).length > 0) return <DeckHubPage />;
    return <NotFoundPage />;
  }
  if (offered) return <DeckDetailPage />;
  if (entry && entry.hub !== deckId) return <Navigate replace to={hubHref} />;
  if (archiveForHub(deckId).length > 0) return <DeckHubPage />;
  return <NotFoundPage />;
};

export default DeckRoute;
