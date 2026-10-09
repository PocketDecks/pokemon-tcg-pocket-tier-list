import { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import LegalPage from "./LegalPage";
import { CONTACT_EMAIL } from "../../app/constants";

const ExternalLink = ({ href, children }: { href: string; children?: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

const PrivacyPage = () => {
  const { t } = useTranslation();
  const strong = <strong />;
  const adsSettingsLink = <ExternalLink href="https://www.google.com/settings/ads" />;
  const aboutAdsLink = <ExternalLink href="https://www.aboutads.info" />;
  const mailLink = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  const googlePrivacyLink = <ExternalLink href="https://policies.google.com/privacy" />;
  const googleAdsPoliciesLink = <ExternalLink href="https://policies.google.com/technologies/ads" />;

  return (
    <LegalPage>
      <h1>{t("privacyPage.title")}</h1>
      <p className="updated">{t("privacyPage.updated")}</p>

      <p>{t("privacyPage.intro")}</p>

      <h2>{t("privacyPage.collect.heading")}</h2>
      <ul>
        <li>
          <Trans i18nKey="privacyPage.collect.usage" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.collect.account" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.collect.feedback" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.collect.payment" components={[strong]} />
        </li>
      </ul>

      <h2>{t("privacyPage.cookies.heading")}</h2>
      <p>{t("privacyPage.cookies.intro")}</p>
      <ul>
        <li>
          <Trans i18nKey="privacyPage.cookies.consent" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.theme" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.reload" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.region" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.timeZone" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.gpc" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.language" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.missing" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.analytics" components={[strong]} />
        </li>
        <li>
          <Trans i18nKey="privacyPage.cookies.ads" components={[strong]} />
        </li>
        <li>
          <Trans
            i18nKey="privacyPage.cookies.optOut"
            components={[adsSettingsLink, aboutAdsLink]}
          />
        </li>
      </ul>

      <h2>{t("privacyPage.consent.heading")}</h2>
      <p>{t("privacyPage.consent.body")}</p>

      <h2>{t("privacyPage.legalBasis.heading")}</h2>
      <p>{t("privacyPage.legalBasis.body")}</p>

      <h2>{t("privacyPage.use.heading")}</h2>
      <ul>
        <li>{t("privacyPage.use.item1")}</li>
        <li>{t("privacyPage.use.item2")}</li>
        <li>{t("privacyPage.use.item3")}</li>
        <li>{t("privacyPage.use.item4")}</li>
      </ul>

      <h2>{t("privacyPage.rights.heading")}</h2>
      <p>{t("privacyPage.rights.body")}</p>

      <h2>{t("privacyPage.thirdParty.heading")}</h2>
      <p>{t("privacyPage.thirdParty.intro")}</p>
      <ul>
        <li>{t("privacyPage.thirdParty.analytics")}</li>
        <li>{t("privacyPage.thirdParty.adsense")}</li>
        <li>{t("privacyPage.thirdParty.firebase")}</li>
        <li>{t("privacyPage.thirdParty.stripe")}</li>
        <li>{t("privacyPage.thirdParty.github")}</li>
      </ul>
      <p>{t("privacyPage.thirdParty.outro")}</p>

      <h2>{t("privacyPage.retention.heading")}</h2>
      <p>
        <Trans
          i18nKey="privacyPage.retention.body"
          components={[googlePrivacyLink, googleAdsPoliciesLink]}
        />
      </p>

      <h2>{t("privacyPage.children.heading")}</h2>
      <p>{t("privacyPage.children.body")}</p>

      <h2>{t("privacyPage.changes.heading")}</h2>
      <p>{t("privacyPage.changes.body")}</p>

      <h2>{t("privacyPage.contact.heading")}</h2>
      <p>
        <Trans i18nKey="privacyPage.contact.body" components={[mailLink]} />
      </p>

      <p>{t("privacyPage.fanNotice")}</p>
    </LegalPage>
  );
};

export default PrivacyPage;
