import React, { useEffect, useId, useRef } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--shadow-dark);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 1.6rem;

  @media (max-width: 900px) {
    padding: 1.2rem;

    :root[data-consent-pending] & {
      padding-bottom: 50vh;
    }
  }
`;

const ModalContent = styled.div<{ $width?: string }>`
  background: var(--bg);
  color: var(--main);
  padding: 3rem;
  border-radius: 12px;
  max-width: ${(props) => props.$width || "70rem"};
  width: 100%;
  margin: 0;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 4px 6px var(--shadow-soft);
  font-size: 1.25rem;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 2rem;

  @media (max-width: 900px) {
    padding: 2rem;
    gap: 1.5rem;
    font-size: 1.1rem;
    line-height: 1.5;

    :root[data-consent-pending] & {
      max-height: calc(50vh - 2.4rem);
    }
  }

  /* Custom scrollbar for better mobile experience */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: var(--bg);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--main);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: var(--f);
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 2rem;
  right: 2rem;
  background: none;
  border: none;
  color: var(--main);
  font-size: 2.5rem;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--white-10);
  }

  @media (max-width: 900px) {
    top: 1.2rem;
    right: 1.2rem;
    font-size: 2rem;
    width: 3.2rem;
    height: 3.2rem;
  }
`;

const Title = styled.h2`
  margin: 0 0 2.5rem 0;
  font-size: 2.5rem;
  line-height: 1.2;

  @media (max-width: 900px) {
    font-size: 2rem;
    margin: 0 0 2rem 0;
    padding-right: 3rem;
  }
`;

interface Props {
  isOpen: boolean;
  header: string;
  close: () => void;
  children: React.ReactNode;
  width?: string;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

const getFocusable = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

const isInOtherModal = (target: EventTarget | null, dialog: HTMLElement) => {
  if (!(target instanceof Element)) return false;
  const modal = target.closest('[aria-modal="true"]');
  return modal !== null && modal !== dialog && !dialog.contains(modal);
};

const hasOpenModal = (element: Element) =>
  element.matches('[aria-modal="true"]') || element.querySelector('[aria-modal="true"]') !== null;

const makeOutsideInert = (target: Element) => {
  const previous: Array<[Element, string | null]> = [];
  let node: Element = target;
  while (node.parentElement) {
    const parent: Element = node.parentElement;
    for (const sibling of Array.from(parent.children)) {
      if (sibling === node || hasOpenModal(sibling)) continue;
      previous.push([sibling, sibling.getAttribute("inert")]);
      sibling.setAttribute("inert", "");
    }
    node = parent;
  }
  return () => {
    for (const [element, value] of previous.reverse()) {
      if (value === null) element.removeAttribute("inert");
      else element.setAttribute("inert", value);
    }
  };
};

const Popup: React.FC<Props> = ({ isOpen, header, close, children, width }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const active = document.activeElement;
    const trigger = active instanceof HTMLElement && active !== document.body ? active : null;
    const releaseOutside = makeOutsideInert(overlay);
    const focusFirst = () => (getFocusable(dialog)[0] ?? dialog).focus();

    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (isInOtherModal(document.activeElement, dialog)) return;
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      if (isInOtherModal(document.activeElement, dialog)) return;

      const focusable = getFocusable(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const inside = current instanceof Node && dialog.contains(current);

      if (event.shiftKey && (!inside || current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !dialog.contains(event.target) &&
        !isInOtherModal(event.target, dialog)
      ) {
        focusFirst();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      releaseOutside();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalOverlay ref={overlayRef} onClick={close}>
      <ModalContent
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        $width={width}
      >
        <CloseButton onClick={close} aria-label={t("a11y.closePopup")}>
          ×
        </CloseButton>
        <Title id={titleId}>{t(header)}</Title>
        {children}
      </ModalContent>
    </ModalOverlay>
  );
};

export default Popup;
