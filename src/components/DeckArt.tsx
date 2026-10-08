import styled from "styled-components";
import { cardIdFromImage, deckThumbUrl, onDeckThumbError } from "../app/deck-thumb";

const THUMB_SIZES = { small: 96, large: 183 };

const ArtFrame = styled.span<{ $size: number }>`
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: ${(props) => props.$size}rem;
    height: ${(props) => props.$size}rem;
    border-radius: 0.6rem;
    overflow: hidden;
    background: var(--fill-hover);
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
    const small = size <= 3.2;
    const thumbSize = small ? THUMB_SIZES.small : THUMB_SIZES.large;
    const srcSet = cardId
        ? `${deckThumbUrl(cardId, THUMB_SIZES.small)} ${THUMB_SIZES.small}w, ${deckThumbUrl(cardId, THUMB_SIZES.large)} ${THUMB_SIZES.large}w`
        : undefined;
    return (
        <ArtFrame $size={size}>
            {src && (
                <Art
                    src={cardId ? deckThumbUrl(cardId, thumbSize) : src}
                    srcSet={srcSet}
                    sizes={small ? "3.2rem" : "7.2rem"}
                    onError={onDeckThumbError(src)}
                    alt=""
                    width={thumbSize}
                    height={thumbSize}
                    loading="lazy"
                />
            )}
        </ArtFrame>
    );
};

export default DeckArt;
