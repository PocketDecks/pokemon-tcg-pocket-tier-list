import styled from "styled-components";
import { useTranslation } from "react-i18next";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import SupporterPanel from "../../components/SupporterPanel";
import SeoContent from "../../components/SeoContent";
import useIsPremium from "../../app/use-is-premium";

const Page = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  background: var(--bg);
`;

const Content = styled.article`
  width: 100%;
  max-width: 48rem;
  padding: 2rem 1.6rem 6rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  color: var(--main);

  h1 {
    margin: 0;
    font-size: 3.6rem;
    font-weight: 600;
    line-height: 1.15;

    @media (max-width: 900px) {
      font-size: 3rem;
    }
  }

  @media (min-width: 901px) {
    padding: 4rem 2.4rem 8rem;
  }
`;

const PremiumPage = () => {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  useMarkContentReady(true);

  return (
    <Page>
      <Content>
        <h1>{t(isPremium ? "premium.title" : "premium.become")}</h1>
        <SupporterPanel />
        <SeoContent>
          <h2>{t("supporter.heading", { ns: "seo" })}</h2>
          <p>{t("supporter.intro", { ns: "seo" })}</p>
          <h3>{t("supporter.howHeading", { ns: "seo" })}</h3>
          <p>{t("supporter.howBody", { ns: "seo" })}</p>
          <h3>{t("supporter.perksHeading", { ns: "seo" })}</h3>
          <p>{t("supporter.perksBody", { ns: "seo" })}</p>
        </SeoContent>
      </Content>
    </Page>
  );
};

export default PremiumPage;
