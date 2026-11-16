import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { CONTACT_EMAIL, KOFI_URL } from "../app/constants";
import useIsPremium, { usePremiumExpiry } from "../app/use-is-premium";
import { loadPremiumCode } from "../app/premium-code";
import { LIFETIME_THRESHOLD_MS } from "../../scripts/entitlement-contract.mjs";
import { entitlementKey } from "../app/query-keys";
import { useAuth } from "../contexts/AuthContext";
import {
  ActionButton,
  Actions,
  AltSection,
  AltToggle,
  Body,
  CtaButton,
  CtaLink,
  Hint,
  InlineLink,
  Perk,
  Perks,
  PerksLead,
  Price,
  Rules,
  SmallPrint,
  Text,
} from "./SupporterPanel.styles";

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
  const lifetime = expiresAt === null || expiresAt > LIFETIME_THRESHOLD_MS;
  const premiumState = isPremium ? (lifetime ? "lifetime" : "expires") : "free";
  const waiting =
    !!tipState &&
    tipState.uid === user?.uid &&
    premiumState !== "lifetime" &&
    (!isPremium || expiresAt === tipState.expiry);

  useEffect(() => {
    const uid = user?.uid;
    if (!isAltOpen || !uid || (isPremium && lifetime)) return;
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
  }, [expiresAt, isAltOpen, isPremium, lifetime, user?.uid]);

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
