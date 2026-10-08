import styled from "styled-components";
import { CardScoreType } from "../app/use-cards";
import useMissing from "../app/use-missing";

const Container = styled.div`
  position: relative;
  height: 100%;

  @media (max-width: 900px) {
    height: auto;
    width: 100%;
    aspect-ratio: 1 / 1;
  }
`;

const StyledCardIcon = styled.button`
  position: relative;
  border-radius: 1.2rem;
  color: var(--on-accent);
  display: flex;
  height: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  cursor: pointer;
`;

const CardImage = styled.img`
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  height: 280%;
`;

const CardNumber = styled.div`
  position: absolute;
  bottom: 0;
  right: 0;
  background: var(--s);
  color: var(--on-accent);
  font-size: 1.6rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
`;
interface Props {
  card: CardScoreType;
}

const CardIcon = ({ card }: Props) => {
  const { addMissing } = useMissing();

  return (
    <Container>
      <StyledCardIcon
        onClick={() => {
          addMissing([card.id]);
        }}
      >
        <CardImage key={card.id} src={card.image} alt={card.name} />
        <CardNumber>{card.count}</CardNumber>
      </StyledCardIcon>
    </Container>
  );
};

export default CardIcon;
