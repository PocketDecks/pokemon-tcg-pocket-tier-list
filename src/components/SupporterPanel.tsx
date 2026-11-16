import styled, { css } from "styled-components";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { CONTACT_EMAIL, KOFI_URL } from "../app/constants";
import useIsPremium, { usePremiumExpiry } from "../app/use-is-premium";
import { loadPremiumCode } from "../app/premium-code";
import { entitlementKey } from "../app/query-keys";
import { useAuth } from "../contexts/AuthContext";

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  width: 100%;
`;

const Text = styled.p`
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.5;
  color: var(--main);
`;

const Price = styled(Text)`
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1.35;
`;

const Hint = styled(Text)`
  font-size: 1.3rem;
  color: var(--text-muted);
`;

const PerksLead = styled(Text)`
  font-size: 1.4rem;
  color: var(--text-muted);
  margin-bottom: -0.8rem;
`;

const Perks = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin: 0;
  padding: 0;
  list-style: none;
`;

const Perk = styled.li`
  position: relative;
  padding-left: 1.8rem;
  font-size: 1.5rem;
  line-height: 1.4;
  color: var(--main);

  &::before {
    content: "";
    position: absolute;
    left: 0.2rem;
    top: 0.65em;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--link);
  }
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const primaryAction = css`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 4.8rem;
  padding: 1.2rem 2.2rem;
  border-radius: 8px;
  background: var(--link);
  color: var(--bg);
  font: inherit;
  font-size: 1.6rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;

  align-self: flex-start;
  min-width: 20rem;

  &:hover {
    opacity: 0.85;
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
  }
`;

const CtaLink = styled.a`
  ${primaryAction}
`;

const CtaButton = styled.button`
  ${primaryAction}
`;

const ActionButton = styled.button`
  cursor: pointer;
  min-height: 4.4rem;
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

const SmallPrint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.8rem;
  font-size: 1.3rem;
  color: var(--text-muted);
`;

const toggleStyles = css`
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  min-height: 3.2rem;
  padding: 0;
  border: 0;
  background: none;
  color: var(--link);
  font: inherit;
  font-size: 1.3rem;
  text-decoration: underline;
`;

const AltToggle = styled.button`
  ${toggleStyles}
`;

const Rules = styled.details`
  summary {
    ${toggleStyles}
  }

  p {
    margin: 0.4rem 0 0;
    font-size: 1.3rem;
    line-height: 1.5;
    color: var(--text-muted);
  }
`;

const AltSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-self: stretch;
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

const PERKS = ["noAds", "windows", "filters", "rankings", "decks", "data", "contact", "earlyAccess", "gratitude"] as const;

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

const SupporterPanel = () => {
  const { t, i18n } = useTranslation();
  const isPremium = useIsPremium();
  const expiresAt = usePremiumExpiry();
  const { user, signInWithGoogle } = useAuth();
  const queryClient = useQueryClient();
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
    if (!isAltOpen || !uid || (isPremium && expiresAt === null)) return;
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
  }, [expiresAt, isAltOpen, isPremium, user?.uid]);

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
    if (!waiting || !uid) return;
    const onFocus = () => {
      void queryClient.invalidateQueries({ queryKey: entitlementKey(uid) });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [queryClient, waiting, user?.uid]);

  if (isPremium === null) return null;

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

  const checkAgain = () => {
    const uid = user?.uid;
    if (uid) void queryClient.refetchQueries({ queryKey: entitlementKey(uid) });
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
    <Body>
      {premiumState !== "lifetime" && <Price>{t("premium.price")}</Price>}
      {premiumState === "expires" && <Text>{t("premium.expires", { date })}</Text>}
      {premiumState === "lifetime" && <Text>{t("premium.lifetime")}</Text>}
      {premiumState === "free" && (
        <>
          <PerksLead>{t("premium.perksLead")}</PerksLead>
          <Perks>
            {PERKS.map((key) => (
              <Perk key={key}>{t(`premium.perks.${key}`)}</Perk>
            ))}
          </Perks>
          <Hint>{t("premium.discord")}</Hint>
        </>
      )}
      {!user && premiumState === "free" && (
        <Actions>
          <Text>{t("premium.signInFirst")}</Text>
          <CtaButton type="button" onClick={() => void signInWithGoogle()}>
            {t("premium.signIn")}
          </CtaButton>
          <Hint>{t("premium.kindNote")}</Hint>
        </Actions>
      )}
      {user && premiumState !== "lifetime" && (
        <Actions>
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
          {premiumState === "free" && <Hint>{t("premium.kindNote")}</Hint>}
          {waiting && (
            <>
              <Text role="status">{t("premium.waiting")}</Text>
              <ActionButton type="button" onClick={checkAgain}>
                {t("premium.checkAgain")}
              </ActionButton>
            </>
          )}
        </Actions>
      )}
      {premiumState !== "lifetime" && (
        <SmallPrint>
          {user && (
            <>
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
          <Rules>
            <summary>{t("premium.rulesToggle")}</summary>
            <p>{t("premium.priceDetails")}</p>
          </Rules>
          <Hint as="span">
            <Trans i18nKey="premium.refund" components={[mailLink]} />
          </Hint>
        </SmallPrint>
      )}
    </Body>
  );
};

export default SupporterPanel;
