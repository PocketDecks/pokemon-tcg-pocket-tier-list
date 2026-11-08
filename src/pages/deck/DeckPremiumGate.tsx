import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useLocaleHref } from "../../app/locale-link";
import { EmptyMessage, Overlay, StyledLink } from "./deck-page.styles";

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 500;
  color: var(--main);
  line-height: 1.2;
  max-width: 60rem;
  text-align: center;

  @media (max-width: 900px) {
    font-size: 3rem;
  }
`;

const DeckPremiumGate = () => {
  const { t } = useTranslation();
  const premiumHref = useLocaleHref("/about#premium");

  return (
    <Overlay>
      <Title>{t("deckPage.premiumGateTitle")}</Title>
      <EmptyMessage>{t("deckPage.premiumGateBody")}</EmptyMessage>
      <StyledLink to={premiumHref}>{t("deckPage.premiumGateAction")}</StyledLink>
    </Overlay>
  );
};

export default DeckPremiumGate;
