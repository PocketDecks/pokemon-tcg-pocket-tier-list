import type { CardType } from "../../app/cards-api";
import useMissing from "../../app/use-missing";
import {
  cardThumbHeight,
  cardThumbSrcSet,
  cardThumbUrl,
  DECK_CARD_SIZES,
  onDeckThumbError,
} from "../../app/deck-thumb";
import {
  CardContainer,
  CardImage,
  CardList,
  CardNumber,
} from "./deck-page.styles";

const THUMB_WIDTH = 240;

interface Props {
  cards: CardType[];
  counts: Map<string, number>;
}

const DeckCardGrid = ({ cards, counts }: Props) => {
  const { addMissing } = useMissing();

  return (
    <CardList>
      {cards.map((card, index) => {
        const count = counts.get(card.id) ?? 0;
        return (
          <CardContainer
            key={card.id}
            $stacked={count > 1}
            onClick={() => {
              if (count === 1) {
                addMissing([card.id, card.id]);
              } else {
                addMissing([card.id]);
              }
            }}
          >
            <CardImage
              src={cardThumbUrl(card.id, THUMB_WIDTH)}
              srcSet={cardThumbSrcSet(card.id)}
              sizes={DECK_CARD_SIZES}
              width={THUMB_WIDTH}
              height={cardThumbHeight(THUMB_WIDTH)}
              alt={card.name}
              loading={index === 0 ? undefined : "lazy"}
              fetchPriority={index === 0 ? "high" : undefined}
              onError={onDeckThumbError(card.image)}
            />
            <CardNumber $count={count}>{count}</CardNumber>
          </CardContainer>
        );
      })}
    </CardList>
  );
};

export default DeckCardGrid;
