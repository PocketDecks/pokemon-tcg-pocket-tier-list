import styled from "styled-components";

const Container = styled.div`
  position: relative;
  height: calc(100dvh / 6 - 3.4rem);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  transform: scale(1.1);
  margin-right: 1rem;

  @media (max-width: 900px) {
    margin: 1rem 0;
  }
`;

const CardImage = styled.img`
  height: calc(127%);
  transform: translateY(-6%);
`;

interface Props {
  image: string;
  alt: string;
  eager?: boolean;
}

const ExpansionIcon = ({ image, alt, eager = false }: Props) => {
  return (
    <Container>
      <CardImage
        src={image}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
      />
    </Container>
  );
};

export default ExpansionIcon;
