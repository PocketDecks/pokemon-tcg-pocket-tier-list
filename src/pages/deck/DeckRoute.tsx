import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import { DECK_ARCHIVE, archiveForHub } from "../../app/deck-archive";
import { premiumWindowsForSlug } from "../../app/premium-deck-slugs";
import { useDecks } from "../../app/use-decks";
import useIsPremium from "../../app/use-is-premium";
import { useMetaWindow } from "../../app/use-meta-window";
import { useLocaleHref } from "../../app/locale-link";
import DeckDetailPage from "./DeckDetailPage";
import DeckHubPage from "./DeckHubPage";
import DeckPageSkeleton from "./DeckPageSkeleton";
import DeckPremiumGate from "./DeckPremiumGate";
import { resolveDeckRoute } from "./resolve-deck-route";
import NotFoundPage from "../not-found/NotFoundPage";

const DeckRoute = () => {
  const { deckId = "" } = useParams();
  const { status, decks } = useDecks();
  const isPremium = useIsPremium();
  const { window, setWindow } = useMetaWindow();
  const [switchedFor, setSwitchedFor] = useState<string | null>(null);
  const entry = DECK_ARCHIVE.find((candidate) => candidate.variant === deckId);
  const hubHref = useLocaleHref(`/deck/${entry?.hub ?? ""}`);
  const premiumWindows = premiumWindowsForSlug(deckId);
  const route = resolveDeckRoute({
    deckId,
    status,
    decks,
    isPremium,
    premiumWindows,
    window,
    switchedFor,
    entryHub: entry?.hub ?? null,
    hubHasDecks: archiveForHub(deckId).length > 0,
  });
  const { switchTo } = route;

  useEffect(() => {
    if (switchTo === null) return;
    setSwitchedFor(deckId);
    setWindow(switchTo);
  }, [switchTo, deckId, setWindow]);

  switch (route.kind) {
    case "skeleton":
      return <DeckPageSkeleton />;
    case "gate":
      return <DeckPremiumGate />;
    case "detail":
      return <DeckDetailPage />;
    case "hub":
      return <DeckHubPage />;
    case "redirect":
      return <Navigate replace to={hubHref} />;
    case "not-found":
      return <NotFoundPage />;
  }
};

export default DeckRoute;
