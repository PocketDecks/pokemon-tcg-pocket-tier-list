import { Navigate, useParams } from "react-router";
import { DECK_ARCHIVE, archiveForHub } from "../../app/deck-archive";
import { deckSlug } from "../../app/deck-slug";
import { useDecks } from "../../app/use-decks";
import { useLocaleHref } from "../../app/locale-link";
import DeckDetailPage from "./DeckDetailPage";
import DeckHubPage from "./DeckHubPage";
import DeckPageSkeleton from "./DeckPageSkeleton";
import NotFoundPage from "../not-found/NotFoundPage";

const DeckRoute = () => {
  const { deckId = "" } = useParams();
  const { decks, loading } = useDecks();
  const entry = DECK_ARCHIVE.find((candidate) => candidate.variant === deckId);
  const hubHref = useLocaleHref(`/deck/${entry?.hub ?? ""}`);

  if (loading) return <DeckPageSkeleton />;
  if (!decks) return entry ? <DeckDetailPage /> : <NotFoundPage />;
  if (decks.some((deck) => deckSlug(deck.name) === deckId)) return <DeckDetailPage />;
  if (entry && entry.hub !== deckId) return <Navigate replace to={hubHref} />;
  if (archiveForHub(deckId).length > 0) return <DeckHubPage />;
  return <NotFoundPage />;
};

export default DeckRoute;
