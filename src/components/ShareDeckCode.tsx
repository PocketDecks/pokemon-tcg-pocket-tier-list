import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { QRCodeCanvas } from "qrcode.react";
import { deckSlug } from "../app/deck-slug";
import logo from "../assets/logo.webp";
import { themeTokens } from "../styles/theme-tokens";

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 2rem;
  font-weight: 500;
  text-align: center;
`;

const QRTile = styled.div`
  padding: 1.2rem;
  background: var(--text);
  border-radius: 0.8rem;
  line-height: 0;
`;

const RawCode = styled.code`
  font-size: 1.3rem;
  line-height: 1.5;
  word-break: break-all;
  text-align: center;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 1rem;
  border-radius: 0.8rem;
  background: var(--card, var(--fill-hover));
  user-select: all;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--main);
    outline-offset: 2px;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 1.2rem;
`;

const ActionButton = styled.button`
  font-size: 1.6rem;
  font-weight: 500;
  color: var(--main);
  background: transparent;
  border: 1px solid var(--main);
  border-radius: 1.2rem;
  padding: 0.8rem 2rem;
  cursor: pointer;

  @media (max-width: 900px) {
    min-height: 4.4rem;
  }

  &:focus-visible {
    outline: 2px solid var(--main);
    outline-offset: 2px;
  }

  &:hover {
    opacity: 0.8;
  }
`;

const Note = styled.p`
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.5;
  text-align: center;
  color: var(--main);
`;

interface ShareDeckCodeProps {
  deckName: string;
  code: string | null;
  energyCount: number;
}

const ShareDeckCode = ({ deckName, code, energyCount }: ShareDeckCodeProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const tileRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    setCopied(false);
  }, [code]);

  if (!code) return null;

  const handleCopy = async () => {
    if (!navigator.clipboard) return;
    const target = code;
    await navigator.clipboard.writeText(target);
    if (codeRef.current === target) {
      setCopied(true);
    }
  };

  const handleDownload = () => {
    const canvas = tileRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${deckSlug(deckName)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleCodeActivation = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCopy();
    }
  };

  return (
    <Wrapper aria-label={`${deckName} ${t("deckPage.shareQrTitle")}`}>
      <Title>{t("deckPage.shareQrHeading")}</Title>
      <QRTile ref={tileRef}>
        <QRCodeCanvas
          value={code}
          size={220}
          level="H"
          marginSize={4}
          bgColor={themeTokens.dark["qr-background"]}
          fgColor={themeTokens.dark["qr-foreground"]}
          title={`${deckName} ${t("deckPage.shareQrTitle", "share QR")}`}
          imageSettings={{
            src: logo,
            width: 44,
            height: 44,
            excavate: true,
          }}
        />
      </QRTile>
      <RawCode
        onClick={handleCopy}
        role="button"
        tabIndex={0}
        onKeyDown={handleCodeActivation}
        title={t("deckPage.shareQrCopyTitle")}
      >
        {code}
      </RawCode>
      <Actions>
        <ActionButton onClick={handleCopy}>
          {copied
            ? t("deckPage.shareQrCopied")
            : t("deckPage.shareQrCopy")}
        </ActionButton>
        <ActionButton onClick={handleDownload}>
          {t("deckPage.shareQrDownload")}
        </ActionButton>
      </Actions>
      {energyCount === 0 && (
        <Note>
          {t(
            "deckPage.shareQrNoEnergy",
            "This deck has no automatic energy type. After importing, add the energy your attacks need."
          )}
        </Note>
      )}
    </Wrapper>
  );
};

export default ShareDeckCode;
