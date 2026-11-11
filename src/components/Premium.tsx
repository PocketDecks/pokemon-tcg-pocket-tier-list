import styled from "styled-components";
import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Popup from "./Popup";
import { CONTACT_EMAIL, KOFI_URL } from "../app/constants";
import useIsPremium, { usePremiumExpiry } from "../app/use-is-premium";
import { loadPremiumCode } from "../app/premium-code";
import { useAuth } from "../contexts/AuthContext";
import premiumIcon from "../assets/premium.webp";

const Button = styled.button`
  cursor: pointer;
`;

const RemoveAdsLink = styled.button`
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--link);
  white-space: nowrap;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.8;
  }
`;

const PremiumIcon = styled.img`
  width: 4rem;
  height: 4rem;
  border-radius: 50%;

  @media (max-width: 900px) {
    width: 3.2rem;
    height: 3.2rem;
  }
`;

const Text = styled.p`
  margin: 0;
  font-size: 1.7rem;
  line-height: 1.6;
  color: var(--main);

  @media (max-width: 900px) {
    font-size: 1.5rem;
  }
`;

const InlineLink = styled.a`
  color: var(--link);
  font-size: inherit;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
`;

interface Props {
  variant?: "default" | "link";
  linkLabel?: string;
}

interface CodeResult {
  uid: string;
  code: string | null;
  failed: boolean;
}

interface CopyFeedback {
  uid: string;
  code: string;
  status: "copied" | "failed";
}

const Premium = ({ variant = "default", linkLabel }: Props) => {
  const { t, i18n } = useTranslation();
  const isPremium = useIsPremium();
  const expiresAt = usePremiumExpiry();
  const { user, signInWithGoogle } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (!isOpen || !uid || (isPremium && expiresAt === null)) return;
    let active = true;
    setCodeResult((current) => (current?.uid === uid ? current : null));
    void loadPremiumCode(uid).then(
      (code) => {
        if (active) setCodeResult({ uid, code, failed: false });
      },
      () => {
        if (active) setCodeResult({ uid, code: null, failed: true });
      }
    );
    return () => {
      active = false;
    };
  }, [expiresAt, isOpen, isPremium, user?.uid]);

  if (isPremium === null) return null;

  const isLink = variant === "link";
  const currentCode = codeResult?.uid === user?.uid ? codeResult : null;
  const copyStatus =
    copyFeedback &&
    currentCode &&
    copyFeedback.uid === currentCode.uid &&
    copyFeedback.code === currentCode.code
      ? copyFeedback.status
      : null;
  const premiumState = isPremium ? (expiresAt === null ? "lifetime" : "expires") : "free";
  const date = expiresAt === null ? "" : new Intl.DateTimeFormat(i18n.language, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(expiresAt));
  const mailLink = (
    <InlineLink href={`mailto:${CONTACT_EMAIL}`} key="email">
      {CONTACT_EMAIL}
    </InlineLink>
  );
  const kofiLink = (
    <InlineLink href={KOFI_URL} target="_blank" rel="noopener noreferrer" key="kofi">
      {t("premium.tip")}
    </InlineLink>
  );

  const copyCode = async () => {
    if (!currentCode?.code) return;
    const feedback = { uid: currentCode.uid, code: currentCode.code };
    if (!navigator.clipboard?.writeText) {
      setCopyFeedback({ ...feedback, status: "failed" });
      return;
    }
    try {
      await navigator.clipboard.writeText(currentCode.code);
      setCopyFeedback({ ...feedback, status: "copied" });
    } catch {
      setCopyFeedback({ ...feedback, status: "failed" });
    }
  };

  return (
    <>
      {isLink && !isPremium && (
        <RemoveAdsLink onClick={() => setIsOpen(true)}>
          {linkLabel ?? t("ads.removeAds")}
        </RemoveAdsLink>
      )}
      {!isLink && (isPremium || user) && (
        <Button
          onClick={() => setIsOpen(true)}
          aria-label={t("premium.title")}
          title={t("premium.title")}
        >
          <PremiumIcon src={premiumIcon} alt="" />
          {!isPremium && t("premium.title")}
        </Button>
      )}
      {(isPremium || isLink || user) && (
        <Popup
          width="60rem"
          isOpen={isOpen}
          header="premium.title"
          close={() => setIsOpen(false)}
        >
          {premiumState !== "lifetime" && (
            <>
              <Text>{t("premium.benefits")}</Text>
              <Text>{t("premium.price")}</Text>
              {!user ? (
                <>
                  <Text>{t("premium.signInFirst")}</Text>
                  <Button onClick={() => void signInWithGoogle()}>
                    {t("premium.signIn")}
                  </Button>
                </>
              ) : (
                <>
                  {premiumState === "expires" && (
                    <Text>{t("premium.expires", { date })}</Text>
                  )}
                  <Text>{t("premium.tipPrompt")}</Text>
                  {currentCode?.code && (
                    <Text>
                      <code>{currentCode.code}</code>{" "}
                      <Button aria-live="polite" onClick={() => void copyCode()}>
                        {t(copyStatus === "copied" ? "premium.copied" : "premium.copy")}
                      </Button>
                    </Text>
                  )}
                  {!currentCode && <Text role="status">{t("premium.codeLoading")}</Text>}
                  {(currentCode?.failed || copyStatus === "failed") && (
                    <Text role="status">{t("premium.codeError")}</Text>
                  )}
                  <Text>{kofiLink}</Text>
                </>
              )}
              {!user && premiumState === "expires" && (
                <Text>{t("premium.expires", { date })}</Text>
              )}
            </>
          )}
          {premiumState === "lifetime" && <Text>{t("premium.lifetime")}</Text>}
          {premiumState !== "lifetime" && (
            <Text>
              <Trans i18nKey="premium.refund" components={[mailLink]} />
            </Text>
          )}
        </Popup>
      )}
    </>
  );
};

export default Premium;
