import styled from "styled-components";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

const ActionButton = styled.button`
  cursor: pointer;
  align-self: flex-start;
  padding: 0.8rem 1.4rem;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--main);
  font: inherit;
  font-size: 1.4rem;
  font-weight: 600;

  &:hover {
    background: var(--fill-hover);
  }
`;

const CtaLink = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  padding: 1.2rem 2.2rem;
  border-radius: 8px;
  background: var(--link);
  color: var(--bg);
  font-size: 1.6rem;
  font-weight: 700;
  text-decoration: none;

  &:hover {
    opacity: 0.85;
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
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

const Hint = styled.p`
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.5;
  color: var(--text-muted);
`;

const TableScroll = styled.div`
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
  overflow-x: auto;
`;

const Comparison = styled.table`
  width: 100%;
  min-width: 30rem;
  border-collapse: collapse;
  font-size: 1.3rem;
  text-align: left;

  th,
  td {
    padding: 0.7rem 0.8rem;
    border-bottom: 1px solid var(--line);
    vertical-align: top;
  }

  thead th {
    color: var(--main);
    font-weight: 700;
  }

  thead th:first-child {
    width: 62%;
  }

  thead th:not(:first-child),
  tbody td {
    text-align: center;
    white-space: nowrap;
  }

  tbody th {
    font-weight: 400;
    text-align: left;
  }
`;

const FeatureTitle = styled.div`
  color: var(--main);
  font-weight: 600;
`;

const FeatureDescription = styled.div`
  margin-top: 0.2rem;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1.4;
  white-space: normal;
`;

const AltToggle = styled.button`
  cursor: pointer;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 1.4rem;
  text-decoration: underline;
`;

const AltSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.2rem;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-sunk);
`;

const InlineLink = styled.a`
  color: var(--link);
  font-size: inherit;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
`;

const COMPARISON_FEATURES = [
  "removeAds",
  "bestDeckFinder",
  "exclude",
  "matchups",
  "filters",
  "sortBy",
  "updated",
  "decks",
] as const;

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

interface TipState {
  uid: string;
  expiry: number | null;
  wasPremium: boolean;
}

const LIFETIME_THRESHOLD = Date.UTC(2100, 0, 1);

const Premium = ({ variant = "default", linkLabel }: Props) => {
  const { t, i18n } = useTranslation();
  const isPremium = useIsPremium();
  const expiresAt = usePremiumExpiry();
  const { user, signInWithGoogle } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isAltOpen, setIsAltOpen] = useState(false);
  const [tipState, setTipState] = useState<TipState | null>(null);
  const [codeResult, setCodeResult] = useState<CodeResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);
  const premiumState =
    isPremium
      ? expiresAt === null || expiresAt > LIFETIME_THRESHOLD
        ? "lifetime"
        : "expires"
      : "free";
  const waiting =
    !!tipState &&
    tipState.uid === user?.uid &&
    premiumState !== "lifetime" &&
    (!isPremium || expiresAt === tipState.expiry);

  useEffect(() => {
    const uid = user?.uid;
    if (!isOpen || !isAltOpen || !uid || (isPremium && expiresAt === null)) return;
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
  }, [expiresAt, isAltOpen, isOpen, isPremium, user?.uid]);

  useEffect(() => {
    if (!tipState) return;
    if (
      tipState.uid === user?.uid &&
      isPremium &&
      (!tipState.wasPremium || expiresAt !== tipState.expiry)
    ) {
      setTipState(null);
    }
  }, [expiresAt, isPremium, tipState, user?.uid]);

  useEffect(() => {
    const uid = user?.uid;
    if (!isOpen || !waiting || !uid) return;
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: ["entitlement", uid] });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isOpen, queryClient, waiting, user?.uid]);

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
  const ctaLabel = t(premiumState === "expires" ? "premium.ctaExtend" : "premium.cta");
  const emailHint = user?.email
    ? t("premium.emailHint", { email: user.email })
    : t("premium.emailHintNoEmail");

  const comparison = (
    <TableScroll>
      <Comparison>
        <thead>
          <tr>
            <th scope="col">{t("premium.features.title")}</th>
            <th scope="col">{t("premium.features.free")}</th>
            <th scope="col">{t("premium.features.premium")}</th>
          </tr>
        </thead>
        <tbody>
          {COMPARISON_FEATURES.map((key) => (
            <tr key={key}>
              <th scope="row">
                <FeatureTitle>{t(`premium.features.${key}.title`)}</FeatureTitle>
                <FeatureDescription>{t(`premium.features.${key}.description`)}</FeatureDescription>
              </th>
              <td>{t(`premium.features.${key}.free`)}</td>
              <td>{t(`premium.features.${key}.premium`)}</td>
            </tr>
          ))}
        </tbody>
      </Comparison>
    </TableScroll>
  );

  const checkAgain = () => {
    const uid = user?.uid;
    if (uid) void queryClient.refetchQueries({ queryKey: ["entitlement", uid] });
  };

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
          {premiumState === "free" && (
            <>
              {comparison}
            </>
          )}
          {premiumState !== "lifetime" && <Text>{t("premium.price")}</Text>}
          {premiumState === "expires" && <Text>{t("premium.expires", { date })}</Text>}
          {!user && premiumState === "free" && (
            <>
              <Text>{t("premium.signInFirst")}</Text>
              <ActionButton onClick={() => void signInWithGoogle()}>
                {t("premium.signIn")}
              </ActionButton>
            </>
          )}
          {user && premiumState !== "lifetime" && (
            <>
              <CtaLink
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (user?.uid) {
                    setTipState({ uid: user.uid, expiry: expiresAt, wasPremium: isPremium });
                  }
                }}
              >
                {ctaLabel}
              </CtaLink>
              <Hint>{emailHint}</Hint>
              {waiting && (
                <>
                  <Text role="status">{t("premium.waiting")}</Text>
                  <ActionButton type="button" onClick={checkAgain}>
                    {t("premium.checkAgain")}
                  </ActionButton>
                </>
              )}
              <AltToggle
                type="button"
                aria-expanded={isAltOpen}
                onClick={() => setIsAltOpen((open) => !open)}
              >
                {t("premium.altCodeToggle")}
              </AltToggle>
              {isAltOpen && (
                <AltSection>
                  {currentCode?.failed ? (
                    <Text role="status">
                      {t(user?.email ? "premium.codeUnavailable" : "premium.codeUnavailableNoEmail")}
                    </Text>
                  ) : currentCode?.code ? (
                    <>
                      <Text>
                        <code>{currentCode.code}</code>{" "}
                        <ActionButton aria-live="polite" onClick={() => void copyCode()}>
                          {t(copyStatus === "copied" ? "premium.copied" : "premium.copy")}
                        </ActionButton>
                      </Text>
                      <Text>{t("premium.altCodeHint")}</Text>
                      {copyStatus === "failed" && (
                        <Text role="status">{t("premium.copyFailed")}</Text>
                      )}
                    </>
                  ) : (
                    <Text role="status">{t("premium.codeLoading")}</Text>
                  )}
                </AltSection>
              )}
            </>
          )}
          {premiumState === "lifetime" && <Text>{t("premium.lifetime")}</Text>}
          {premiumState !== "lifetime" && (
            <Text>
              <Trans i18nKey="premium.refund" components={[mailLink]} />
            </Text>
          )}
          {(premiumState === "free" || premiumState === "expires") && (
            <Hint>{t("premium.priceDetails")}</Hint>
          )}
        </Popup>
      )}
    </>
  );
};

export default Premium;
