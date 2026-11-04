import styled from "styled-components";
import type { CSSProperties } from "react";

const MAX_FANNED = 3;

const Fan = styled.div`
  --fan-unit: calc((100dvh / 6 - 3.4rem) * 0.72);
  position: relative;
  height: calc(100dvh / 6 - 3.4rem);
  width: calc(var(--fan-unit) * (1 + 0.3 * (var(--fan-count) - 1)));
  overflow: hidden;
  transform: scale(1.1);
  margin-right: 1rem;

  @media (max-width: 900px) {
    margin: 1rem 0;
  }
`;

const FanImage = styled.img`
  position: absolute;
  top: 50%;
  left: calc(var(--fan-unit) * 0.3 * var(--fan-index));
  width: var(--fan-unit);
  height: 127%;
  object-fit: cover;
  transform: translateY(-56%);
`;

interface Props {
  images: string[];
}

const ExpansionFan = ({ images }: Props) => {
  const fanned = images.slice(0, MAX_FANNED);
  return (
    <Fan style={{ "--fan-count": fanned.length } as CSSProperties}>
      {fanned.map((image, index) => (
        <FanImage
          key={image}
          src={image}
          alt=""
          style={{ "--fan-index": index } as CSSProperties}
        />
      ))}
    </Fan>
  );
};

export default ExpansionFan;
