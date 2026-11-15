import React, { useEffect, useId, useRef } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { focusFirst, takeTrigger, trackPresses, trapFocus } from "./popup-focus";
import { makeOutsideInert } from "./popup-inert";
import { acquirePopup } from "./popup-state";

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

const Popup: React.FC<Props> = ({ isOpen, header, close, children, width }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(trackPresses, []);

  useEffect(() => {
    if (!isOpen) return;
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;

    const trigger = takeTrigger();
    focusFirst(dialog);
    const releaseOutside = makeOutsideInert(overlay);
    const releasePopup = acquirePopup();
    const releaseTrap = trapFocus(dialog, () => closeRef.current());

    return () => {
      releaseTrap();
      releaseOutside();
      releasePopup();
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
