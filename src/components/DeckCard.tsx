import styled, { keyframes } from "styled-components";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { deckDisplayName } from "../app/deck-display";
import { deckThumbUrl, onDeckThumbError } from "../app/deck-thumb";
import { FullDeckType } from "../contexts/DecksContext";
import { MetaShareEntry } from "../types/pipeline-data";
import { deltaTrend } from "../app/delta-trend";
import NavIcon from "./NavIcon";

const THUMB_SIZES = { small: 96, large: 183 };

const Container = styled.div`
  position: relative;
  height: 100%;

  @media (max-width: 900px) {
    height: auto;
    width: 100%;
    aspect-ratio: 1 / 1;
  }
`;

const StyledDeckCard = styled(Link)`
  position: relative;
  container-type: inline-size;
  transition: box-shadow 150ms ease-out;

  ${Container}:hover & {
    box-shadow: 0 0 0 2px var(--focus), 0 0 1.6rem var(--accent-shadow);
  }

  border-radius: 1.2rem;
  color: var(--bg);
  display: flex;
  height: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  cursor: pointer;
`;

const SubCard = styled(Link)`
  position: absolute;
  bottom: -1rem;
  right: -1rem;
  border-radius: 0.6rem;
  color: var(--bg);
  height: 50%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: solid 1px var(--shadow-dark);
  box-shadow: 0 0 0.5rem var(--shadow-dark);
  transition: border-color 150ms ease-out;

  ${Container}:hover & {
    border-color: var(--focus);
  }
`;

const DeckImage = styled.img`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const Badge = styled.div<{ $tone: "up" | "down" | "flat" | "new" }>`
  position: absolute;
  top: 5cqw;
  left: 5cqw;
  display: inline-flex;
  align-items: center;
  gap: 0.25em;
  height: 1.9em;
  padding: 0 0.55em;
  border-radius: 0.5em;
  font-size: clamp(1rem, 13cqw, 1.4rem);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  background: ${(props) => (props.$tone === "new" ? "var(--status-new)" : "var(--black-10)")};
  color: ${(props) =>
    props.$tone === "new"
      ? "var(--on-accent)"
      : props.$tone === "up"
        ? "var(--status-up)"
        : props.$tone === "down"
          ? "var(--status-down)"
          : "var(--white-85)"};
  box-shadow: 0 0.1em 0.4em var(--shadow-medium);

  svg {
    width: 0.9em;
    height: 0.9em;
  }
`;

const appear = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const NameBubble = styled.div`
  position: fixed;
  z-index: 1000;
  max-width: min(32rem, calc(100vw - 2.4rem));
  padding: 0.7rem 1.2rem;
  border-radius: 0.8rem;
  background: var(--black-94);
  border: 1px solid var(--focus);
  box-shadow: 0 0.6rem 1.6rem var(--shadow-strong), 0 0 1.6rem var(--accent-shadow);
  color: var(--text-inverse);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  animation: ${appear} 120ms ease-out 150ms both;
`;

const BUBBLE_GAP = 8;
const BUBBLE_MARGIN = 12;

const NameTip = ({ anchor, text }: { anchor: DOMRect; text: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(anchor.left + anchor.width / 2);
  const [top, setTop] = useState(anchor.bottom + BUBBLE_GAP);

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    const width = rect?.width ?? 0;
    const centred = anchor.left + anchor.width / 2 - width / 2;
    setLeft(Math.max(BUBBLE_MARGIN, Math.min(centred, window.innerWidth - width - BUBBLE_MARGIN)));
    setTop(Math.max(BUBBLE_MARGIN, anchor.top - (rect?.height ?? 0) - BUBBLE_GAP));
  }, [anchor]);

  return (
    <NameBubble ref={ref} aria-hidden="true" style={{ left, top }}>
      {text}
    </NameBubble>
  );
};

interface Props {
  deck: FullDeckType;
  metaShare?: MetaShareEntry | null;
  metaShareLabel?: string;
}

const formatShare = (share: number): string => `${(share * 100).toFixed(1)}%`;


const DeckCard = ({ deck, metaShare, metaShareLabel }: Props) => {
    const share = metaShare?.share ?? null;
    const delta = metaShare?.delta ?? null;
    const trend = deltaTrend(delta);
    const name = deckDisplayName(deck);
    const containerRef = useRef<HTMLDivElement>(null);
    const [anchor, setAnchor] = useState<DOMRect | null>(null);

    const show = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) setAnchor(rect);
    };
    const hide = () => setAnchor(null);

    useEffect(() => {
        if (!anchor) return;
        const hideOnScroll = () => setAnchor(null);
        const follow = () => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) setAnchor(rect);
        };
        document.addEventListener("scroll", hideOnScroll, { capture: true, passive: true });
        window.addEventListener("resize", follow);
        return () => {
            document.removeEventListener("scroll", hideOnScroll, { capture: true });
            window.removeEventListener("resize", follow);
        };
    }, [anchor]);

    const shareLabel = metaShare?.isNew
        ? "NEW"
        : metaShare && share !== null
          ? `${metaShareLabel ?? "Meta share"} ${formatShare(share)}`
          : null;

    return (
        <Container
            ref={containerRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            <StyledDeckCard
                to={`/deck/${deck.id}`}
                aria-label={shareLabel ? `${name}, ${shareLabel}` : name}
            >
                <DeckImage
                    key={deck.iconPrimary.id}
                    src={deckThumbUrl(deck.iconPrimary.id, THUMB_SIZES.large)}
                    srcSet={`${deckThumbUrl(deck.iconPrimary.id, THUMB_SIZES.small)} ${THUMB_SIZES.small}w, ${deckThumbUrl(deck.iconPrimary.id, THUMB_SIZES.large)} ${THUMB_SIZES.large}w`}
                    sizes="(max-width: 900px) 25vw, 8vw"
                    onError={onDeckThumbError(deck.iconPrimary.image)}
                    alt={deck.iconPrimary.name}
                    width={183}
                    height={183}
                />
                {metaShare?.isNew ? (
                    <Badge $tone="new" title={metaShareLabel ?? "Meta share"}>
                        NEW
                    </Badge>
                ) : metaShare && share !== null ? (
                    <Badge $tone={trend} title={metaShareLabel ?? "Meta share"}>
                        {formatShare(share)}
                        {trend !== "flat" && (
                            <NavIcon name={trend === "up" ? "arrowUp" : "arrowDown"} size={12} />
                        )}
                    </Badge>
                ) : null}
            </StyledDeckCard>
            {deck.iconSecondary && (
                <SubCard to={`/deck/${deck.id}`} tabIndex={-1} aria-hidden="true">
                    <DeckImage
                        key={deck.iconSecondary.id}
                        src={deckThumbUrl(deck.iconSecondary.id, THUMB_SIZES.large)}
                        srcSet={`${deckThumbUrl(deck.iconSecondary.id, THUMB_SIZES.small)} ${THUMB_SIZES.small}w, ${deckThumbUrl(deck.iconSecondary.id, THUMB_SIZES.large)} ${THUMB_SIZES.large}w`}
                        sizes="(max-width: 900px) 25vw, 8vw"
                        onError={onDeckThumbError(deck.iconSecondary.image)}
                        alt={deck.iconSecondary.name}
                        width={183}
                        height={183}
                    />
                </SubCard>
            )}
            {anchor && <NameTip anchor={anchor} text={name} />}
        </Container>
    );
};

export default DeckCard;
