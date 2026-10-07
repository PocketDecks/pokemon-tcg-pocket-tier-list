import styled from "styled-components";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Popup from "./Popup";
import { CONTACT_EMAIL, MANAGE_SUBSCRIPTION_URL } from "../app/constants";
import useIsPremium from "../app/use-is-premium";
import premiumIcon from "../assets/premium.webp";

const ButtonContainer = styled.button`
  cursor: pointer;
`;

const RemoveAdsLink = styled.button`
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--f);
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
  color: var(--f);
  font-size: inherit;
  text-decoration: underline;

  &:hover {
    opacity: 0.8;
  }
`;

interface Props {
  // "link" renders a compact "Remove ads" text trigger (used by the ad anchor)
  // instead of the default premium icon.
  variant?: "default" | "link";
  linkLabel?: string;
}

// Signups are paused during the maintainer transition, so this panel is purely
// self-service for existing subscribers.
const Premium = ({ variant = "default", linkLabel }: Props) => {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const [isOpen, setIsOpen] = useState(false);

  if (isPremium === null) return null;

  const isLink = variant === "link";
  const mailLink = (
    <InlineLink href={`mailto:${CONTACT_EMAIL}`} key="email" />
  );
  const billingLink = (
    <InlineLink
      href={MANAGE_SUBSCRIPTION_URL}
      target="_blank"
      rel="noopener noreferrer"
      key="billing"
    />
  );

  return (
    <>
      {isLink && !isPremium && (
        <RemoveAdsLink onClick={() => setIsOpen(true)}>
          {linkLabel ?? t("ads.removeAds")}
        </RemoveAdsLink>
      )}
      {!isLink && isPremium && (
        <ButtonContainer onClick={() => setIsOpen(true)}>
          <PremiumIcon src={premiumIcon} alt="Premium" />
        </ButtonContainer>
      )}
      {(isPremium || isLink) && (
        <Popup
          width="60rem"
          isOpen={isOpen}
          header="premium.windDown.headline"
          close={() => setIsOpen(false)}
        >
          <Text>{t("premium.windDown.status")}</Text>
          <Text>
            <Trans
              i18nKey="premium.windDown.active"
              components={[billingLink]}
            />
          </Text>
          <Text>
            <Trans i18nKey="premium.windDown.refund" components={[mailLink]} />
          </Text>
        </Popup>
      )}
    </>
  );
};

export default Premium;
