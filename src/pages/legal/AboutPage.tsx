import { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import LegalPage from "./LegalPage";
import { GITHUB_URL, CONTACT_EMAIL } from "../../app/constants";
import { useLocaleHref } from "../../app/locale-link";

const ExternalLink = ({ href, children }: { href: string; children?: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

const InternalLink = ({ href, children }: { href: string; children?: ReactNode }) => (
  <a href={href}>{children}</a>
);

const AboutPage = () => {
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/");
  const strong = <strong />;
  const limitlessLink = <ExternalLink href="https://limitlesstcg.com/" />;
  const cardsLink = (
    <ExternalLink href="https://github.com/PocketDecks/pokemon-tcg-pocket-cards" />
  );
  const githubLink = <ExternalLink href={GITHUB_URL} />;
  const mailLink = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  const tierListLink = <InternalLink href={tierListHref} />;

  return (
      <LegalPage>
          <h1>{t("about.heading", { ns: "seo" })}</h1>

          <p>{t("about.intro", { ns: "seo" })}</p>

          <h2>{t("about.rankingsHeading", { ns: "seo" })}</h2>
          <p>{t("about.rankingsBody", { ns: "seo" })}</p>
          <h2>{t("about.toolsHeading", { ns: "seo" })}</h2>
          <ul>
              <li>
                  <Trans i18nKey="about.toolsTierList" ns="seo" components={[strong, tierListLink]} />
              </li>
              <li>
                  <Trans i18nKey="about.toolsFinder" ns="seo" components={[strong]} />
              </li>
              <li>
                  <Trans i18nKey="about.toolsMatchups" ns="seo" components={[strong]} />
              </li>
              <li>
                  <Trans i18nKey="about.toolsCards" ns="seo" components={[strong]} />
              </li>
          </ul>

          <h2>{t("about.sourcesHeading", { ns: "seo" })}</h2>
          <p>
              <Trans
                  i18nKey="about.sources"
                  ns="seo"
                  components={[limitlessLink, cardsLink]}
              />
          </p>

          <h2 id="premium">{t("about.premiumHeading", { ns: "seo" })}</h2>
          <p>
              <Trans i18nKey="about.premium" ns="seo" components={[strong]} />
          </p>

          <h2>{t("about.openSourceHeading", { ns: "seo" })}</h2>
          <p>
              <Trans i18nKey="about.openSource" ns="seo" components={[githubLink]} />
          </p>

          <h2>{t("about.contactHeading", { ns: "seo" })}</h2>
          <p>
              <Trans i18nKey="about.contact" ns="seo" components={[mailLink]} />
          </p>

          <p>{t("about.fanNotice", { ns: "seo" })}</p>
      </LegalPage>
  );
};

export default AboutPage;
