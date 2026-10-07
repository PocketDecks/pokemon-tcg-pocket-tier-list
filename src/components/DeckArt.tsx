import styled from "styled-components";

const ArtFrame = styled.span<{ $size: number }>`
    position: relative;
    display: inline-block;
    flex-shrink: 0;
    width: ${(props) => props.$size}rem;
    height: ${(props) => props.$size}rem;
    border-radius: 0.6rem;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.06);

    img {
        position: absolute;
        top: -32%;
        left: 50%;
        transform: translateX(-50%);
        height: 280%;
    }
`;

const DeckArt = ({ src, size }: { src?: string; size: number }) => {
    const pixels = Math.round(size * 16);
    return (
        <ArtFrame $size={size}>
            {src && <img src={src} alt="" width={pixels} height={pixels} loading="lazy" />}
        </ArtFrame>
    );
};

export default DeckArt;
