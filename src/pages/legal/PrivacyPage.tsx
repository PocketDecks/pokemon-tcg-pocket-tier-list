import LegalPage from "./LegalPage";
import {CONTACT_EMAIL} from "../../app/constants";

const PrivacyPage = () => {
  return (
    <LegalPage>
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: August 13, 2026</p>

      <p>
        This Privacy Policy explains how Top Pocket Decks ("we", "us", or the
        "site"), available at pocketdecks.top, collects, uses, and shares
        information when you use the site. By using the site you agree to the
        practices described here.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Usage data.</strong> We use Google Analytics to understand how
          visitors use the site (for example pages viewed, approximate location,
          device type, and referring source). This data is aggregated and is not
          used to personally identify you.
        </li>
        <li>
          <strong>Account information.</strong> If you sign in with Google, we
          receive basic profile information (your name, email address, and
          profile photo) through Firebase Authentication so we can manage your
          account and legacy & Premium subscriptions.
        </li>
        <li>
          <strong>Feedback.</strong> If you send feedback while signed in, we
          store your message, the topic you chose, the page you came from and
          your account ID in Firebase so we can read and act on it. We store
          your email address with it only if you tick the box asking us to
          reply.
        </li>
        <li>
          <strong>Payment information.</strong> Premium subscriptions are
          processed by Stripe. Payments are handled entirely by Stripe and we do
          not receive or store your full card details.
        </li>
      </ul>

      <h2>Cookies and tracking</h2>
      <p>
        The site uses cookies and similar technologies for essential
        functionality, analytics, and advertising. While we previously displayed ads through
        Google AdSense, advertisements are currently disabled for all users
        during our maintainer transition.
      </p>
      <ul>
        <li>
          Third-party vendors, including Google, use cookies to serve ads based
          on a user's prior visits to this and other websites.
        </li>
        <li>
          Google's use of advertising cookies enables it and its partners to
          serve ads to you based on your visit to this site and/or other sites on
          the Internet.
        </li>
        <li>
          You may opt out of personalized advertising by visiting{" "}
          <a
            href="https://www.google.com/settings/ads"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Ads Settings
          </a>
          . You can also opt out of some third-party vendors' use of cookies for
          personalized advertising at{" "}
          <a
            href="https://www.aboutads.info"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.aboutads.info
          </a>
          .
        </li>
      </ul>

      <h2>Consent for users in the EEA, UK, and Switzerland</h2>
      <p>
        If you are located in the European Economic Area, the United Kingdom, or
        Switzerland, we present a consent message before setting non-essential
        cookies, in line with applicable laws. You can change or withdraw your
        consent at any time.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To provide and improve the site and its features.</li>
        <li>To operate accounts and manage Premium & legacy subscriptions.</li>
        <li>To understand usage and measure performance.</li>
        <li>To display advertising to free-tier visitors.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        Depending on your location, you may have the right to access, correct, or
        delete your personal data, or to object to or restrict certain
        processing. To exercise these rights, contact us using the details below.
        Premium subscribers do not see ads.
      </p>

      <h2>Third-party services</h2>
      <p>
        We rely on third-party providers including Google (Analytics, AdSense,
        and Authentication), Firebase, and Stripe. Their use of your information
        is governed by their own privacy policies.
      </p>

      <h2>Children</h2>
      <p>
        The site is not directed to children under the age of 13, and we do not
        knowingly collect personal information from them.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Changes will be
        posted on this page with an updated revision date.
      </p>

      <h2>Contact</h2>
      <p>
        If you have any questions about this Privacy Policy, contact us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <p>
        Top Pocket Decks is a fan-made project and is not affiliated with,
        endorsed by, or sponsored by Nintendo, The Pokémon Company, Creatures
        Inc., GAME FREAK Inc., or DeNA.
      </p>
    </LegalPage>
  );
};

export default PrivacyPage;
