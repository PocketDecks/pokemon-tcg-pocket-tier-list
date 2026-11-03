import { useParams } from "react-router";
import { DECK_VARIANTS } from "../../app/deck-archive";
import DeckDetailPage from "./DeckDetailPage";
import DeckHubPage from "./DeckHubPage";
import NotFoundPage from "../not-found/NotFoundPage";

const DeckRoute = () => {
  const { deckId } = useParams();
  if (!deckId) return <NotFoundPage />;
  return DECK_VARIANTS.has(deckId) ? <DeckDetailPage /> : <DeckHubPage />;
};

export default DeckRoute;
