import cardsPayload from "pokemon-tcg-pocket-cards/core";
import expansionsPayload from "pokemon-tcg-pocket-cards/expansions";

export const FREE_DECK_AMOUNT = 30;
export const CARDS_URL = cardsPayload;
export const EXPANSIONS_URL = expansionsPayload;
export const GITHUB_URL =
  "https://github.com/PocketDecks/pokemon-tcg-pocket-tier-list";
export const CARDS_REPO_URL =
  "https://github.com/chase-mew/pokemon-tcg-pocket-cards";
export const TWITTER_URL = "https://twitter.com/pocketdecks";
export const GOOGLE_ANALYTICS_URL = 'https://www.googletagmanager.com/gtag/js?id=G-SBZ51J3S1R';
export const GOOGLE_GTAG = 'G-SBZ51J3S1R';
export const CONTACT_EMAIL = "infoLeonid@protonMail.com";
export const MANAGE_SUBSCRIPTION_URL =
  "https://billing.stripe.com/p/login/4gM9ASeDk2QcaKq2Y957W00";

export type SocialName = "github" | "twitter";

export const SOCIALS: { url: string; name: SocialName; label: string }[] = [
  {
    url: GITHUB_URL,
    name: "github",
    label: "View source code on GitHub",
  },
  {
    url: TWITTER_URL,
    name: "twitter",
    label: "Follow us on Twitter",
  },
];
