import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { Trans } from "react-i18next";
import { GITHUB_URL } from "../../app/constants";
import NavIcon, { type NavIconName } from "../../components/NavIcon";

interface FeatureType {
  title: string;
  description: string | React.ReactNode;
  icon: NavIconName;
  tier: string;
}

const StyledFeatures = styled.section`
  width: 100%;
  max-width: 150rem;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
  gap: 6.4rem;
  padding: 9.6rem 4rem 8rem;
  border-top: 1px solid var(--fill-hover);

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
    gap: 4rem;
  }

  @media (max-width: 900px) {
    padding: 6.4rem 2rem 5.6rem;
  }
`;

const Title = styled.h2`
  font-size: 4.8rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;

  @media (max-width: 900px) {
    font-size: 3.6rem;
  }
`;

const List = styled.ul`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4.8rem 4rem;
  list-style: none;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
    gap: 3.2rem;
  }
`;

const Item = styled.li`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 1.6rem;
  row-gap: 0.8rem;
  align-items: start;
`;

const Chip = styled.span<{ $color: string }>`
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 1.2rem;
  background: ${(props) => props.$color};
  color: var(--black-78);
`;

const ItemTitle = styled.h3`
  font-size: 2.2rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  padding-top: 0.2rem;
`;

const Description = styled.p`
  max-width: 46ch;
  font-size: 1.6rem;
  line-height: 1.6;
  color: var(--white-72);
  text-wrap: pretty;
`;

const StyledLink = styled.a`
  color: var(--main);
  text-decoration: underline;
  text-underline-offset: 0.3rem;
`;

const Features = () => {
  const { t } = useTranslation();

  const FEATURES: FeatureType[] = [
    {
      title: t("features.tournamentResults.title"),
      description: t("features.tournamentResults.description"),
      icon: "trophy",
      tier: "var(--s)",
    },
    {
      title: t("features.weeklyUpdates.title"),
      description: t("features.weeklyUpdates.description"),
      icon: "calendar",
      tier: "var(--a)",
    },
    {
      title: t("features.statistics.title"),
      description: t("features.statistics.description"),
      icon: "statistics",
      tier: "var(--b)",
    },
    {
      title: t("features.matchups.title"),
      description: t("features.matchups.description"),
      icon: "versus",
      tier: "var(--c)",
    },
    {
      title: t("features.missingCards.title"),
      description: t("features.missingCards.description"),
      icon: "cardMinus",
      tier: "var(--d)",
    },
    {
      title: t("features.filters.title"),
      description: t("features.filters.description"),
      icon: "sliders",
      tier: "var(--f)",
    },
    {
      title: t("features.qrImport.title"),
      description: t("features.qrImport.description"),
      icon: "qr",
      tier: "var(--s)",
    },
    {
      title: t("features.openSource.title"),
      description: (
        <Trans
          i18nKey="features.openSource.description"
          components={[
            <StyledLink
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              key="github"
            />,
          ]}
        />
      ),
      icon: "code",
      tier: "var(--a)",
    },
  ];

  return (
    <StyledFeatures>
      <Title>{t("features.title")}</Title>
      <List>
        {FEATURES.map((feature) => (
          <Item key={feature.title}>
            <Chip $color={feature.tier} aria-hidden="true">
              <NavIcon name={feature.icon} size={24} />
            </Chip>
            <ItemTitle>{feature.title}</ItemTitle>
            <Description>{feature.description}</Description>
          </Item>
        ))}
      </List>
    </StyledFeatures>
  );
};

export default Features;
