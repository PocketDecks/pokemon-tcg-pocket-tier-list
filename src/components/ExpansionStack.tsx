import styled from "styled-components";

const MAX_BEHIND = 2;

const Stack = styled.div`
  position: relative;
  height: calc(100dvh / 6 - 3.4rem);
  transform: scale(1.1);
  margin-right: 1rem;

  @media (max-width: 900px) {
    margin: 1rem 0;
  }
`;

const Pack = styled.div`
  position: relative;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
`;

const Behind = styled(Pack)<{ $depth: number }>`
  position: absolute;
  top: 0;
  left: 0;
  transform: translate(calc(0.5rem * ${(props) => props.$depth}), calc(-0.5rem * ${(props) => props.$depth}));
  filter: brightness(0.6);
`;

const PackImage = styled.img`
  height: calc(127%);
  transform: translateY(-6%);
`;

interface Props {
  images: string[];
}

const ExpansionStack = ({ images }: Props) => {
  const [front, ...behind] = images.slice(0, MAX_BEHIND + 1);
  const layers = behind.map((image, index) => ({ image, depth: index + 1 })).reverse();
  return (
    <Stack>
      {layers.map(({ image, depth }) => (
        <Behind key={image} $depth={depth} aria-hidden="true">
          <PackImage src={image} alt="" />
        </Behind>
      ))}
      <Pack>
        <PackImage src={front} alt="" />
      </Pack>
    </Stack>
  );
};

export default ExpansionStack;
