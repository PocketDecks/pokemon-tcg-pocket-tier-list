import styled from "styled-components";
import { cardIdFromImage, deckThumbUrl, onDeckThumbError } from "../app/deck-thumb";

const ArtFrame = styled.span<{ $size: number }>`
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: ${(props) => props.$size}rem;
    height: ${(props) => props.$size}rem;
    border-radius: 0.6rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);
`;

const Art = styled.img`
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
`;

const DeckArt = ({ src, size }: { src?: string; size: number }) => {
    const cardId = src ? cardIdFromImage(src) : null;
    return (
        <ArtFrame $size={size}>
            {src && (
                <Art
                    src={cardId ? deckThumbUrl(cardId) : src}
                    onError={onDeckThumbError(src)}
                    alt=""
                    width={183}
                    height={183}
                    loading="lazy"
                />
            )}
        </ArtFrame>
    );
};

export default DeckArt;
