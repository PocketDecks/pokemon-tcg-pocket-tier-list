import styled from "styled-components";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import NavIcon from "./NavIcon";

const VIEWPORT_MARGIN = 12;
const GAP = 8;

const Trigger = styled.button`
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  margin-left: 0.6rem;
  border-radius: 50%;
  color: var(--white-60);
  cursor: help;
  transition: color 160ms ease-out, background-color 160ms ease-out;

  &::after {
    content: "";
    position: absolute;
    inset: -1rem;
  }

  &:hover,
  &[aria-expanded="true"] {
    color: var(--main);
    background: var(--line);
  }
`;

const Bubble = styled.div<{ $open: boolean }>`
  position: fixed;
  z-index: 1000;
  max-width: min(32rem, calc(100vw - ${VIEWPORT_MARGIN * 2}px));
  padding: 1.2rem 1.4rem;
  border-radius: 1rem;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: 0 1.2rem 3.2rem var(--shadow-deep);
  color: var(--main);
  font-size: 1.4rem;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  pointer-events: none;
  opacity: ${(props) => (props.$open ? 1 : 0)};
  visibility: ${(props) => (props.$open ? "visible" : "hidden")};
  transform: translateY(${(props) => (props.$open ? "0" : "0.4rem")});
  transition: opacity 150ms ease-out, transform 150ms ease-out, visibility 150ms;
`;

interface Props {
  text: string;
  ariaLabel?: string;
}

const Tooltip = ({ text, ariaLabel }: Props) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const anchor = trigger.getBoundingClientRect();
    const { width, height } = bubble.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left + anchor.width / 2 - width / 2, maxLeft));
    const below = anchor.bottom + GAP;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, anchor.top - GAP - height);
    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <Trigger
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel ?? text}
        aria-describedby={id}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
      >
        <NavIcon name="info" size={18} />
      </Trigger>
      <Bubble
        ref={bubbleRef}
        id={id}
        role="tooltip"
        $open={open}
        style={{ top: position.top, left: position.left }}
      >
        {text}
      </Bubble>
    </>
  );
};

export default Tooltip;
