import type { CardType } from "../../app/cards-api";
import useMissing from "../../app/use-missing";
import {
  CardContainer,
  CardImage,
  CardList,
  CardNumber,
} from "./deck-page.styles";

interface Props {
  cards: CardType[];
  counts: Map<string, number>;
}

const DeckCardGrid = ({ cards, counts }: Props) => {
  const { addMissing } = useMissing();

  return (
    <CardList>
      {cards.map((card) => {
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
            <CardImage src={card.image} alt={card.name} />
            <CardNumber $count={count}>{count}</CardNumber>
          </CardContainer>
        );
      })}
    </CardList>
  );
};

export default DeckCardGrid;
