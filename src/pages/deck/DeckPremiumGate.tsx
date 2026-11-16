import styled from "styled-components";
import { useTranslation } from "react-i18next";
import SupporterLink from "../../components/SupporterLink";
import { EmptyMessage, Overlay } from "./deck-page.styles";

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

const GateLink = styled(SupporterLink)`
  color: var(--main);
  font-weight: 500;
  font-size: 2rem;
  margin-left: 5px;
  text-decoration: underline;
`;

const DeckPremiumGate = () => {
  const { t } = useTranslation();

  return (
    <Overlay>
      <Title>{t("deckPage.premiumGateTitle")}</Title>
      <EmptyMessage>{t("deckPage.premiumGateBody")}</EmptyMessage>
      <GateLink>{t("deckPage.premiumGateAction")}</GateLink>
    </Overlay>
  );
};

export default DeckPremiumGate;
