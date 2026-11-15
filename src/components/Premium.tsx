import styled from "styled-components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Popup from "./Popup";
import SupporterPanel from "./SupporterPanel";
import useIsPremium from "../app/use-is-premium";
import { useAuth } from "../contexts/AuthContext";
import premiumIcon from "../assets/premium.webp";

const Trigger = styled.button`
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  color: var(--main);
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  text-wrap: balance;

  @media (max-width: 900px) {
    flex-direction: row;
    gap: 0.6rem;
    min-height: 4.4rem;
    padding: 0.4rem 1rem 0.4rem 0.6rem;
    border: 1px solid var(--line-strong);
    border-radius: 1.2rem;
    text-align: left;
    font-size: 1.2rem;
  }
`;

const TriggerLabel = styled.span`
  @media (max-width: 900px) {
    max-width: 8rem;
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
  flex: none;
  width: 4rem;
  height: 4rem;
  border-radius: 50%;

  @media (max-width: 900px) {
    width: 3.2rem;
    height: 3.2rem;
  }
`;

interface Props {
  variant?: "default" | "link";
  linkLabel?: string;
}

const Premium = ({ variant = "default", linkLabel }: Props) => {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (isPremium === null) return null;

  const isLink = variant === "link";
  const heading = isPremium ? "premium.title" : "premium.become";

  return (
    <>
      {isLink && !isPremium && (
        <RemoveAdsLink onClick={() => setIsOpen(true)}>
          {linkLabel ?? t("ads.removeAds")}
        </RemoveAdsLink>
      )}
      {!isLink && (isPremium || user) && (
        <Trigger
          onClick={() => setIsOpen(true)}
          aria-label={t(heading)}
          title={t(heading)}
        >
          <PremiumIcon src={premiumIcon} alt="" />
          {!isPremium && <TriggerLabel>{t("premium.become")}</TriggerLabel>}
        </Trigger>
      )}
      {(isPremium || isLink || user) && (
        <Popup
          width="44rem"
          isOpen={isOpen}
          header={heading}
          close={() => setIsOpen(false)}
        >
          <SupporterPanel />
        </Popup>
      )}
    </>
  );
};

export default Premium;
