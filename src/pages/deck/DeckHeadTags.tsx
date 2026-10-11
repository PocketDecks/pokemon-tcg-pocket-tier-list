import { useTranslation } from "react-i18next";
import { deckDisplayName, type NamedDeck } from "../../app/deck-display";
import {
  friendlyName,
  JA_DECK_DESCRIPTION_SUFFIX,
  JA_DECK_TITLE_SUFFIX,
} from "../../app/deck-friendly-name";
import { useLocale } from "../../app/locale-link";
import { localizedUrl } from "../../app/locale-route";

const SITE_URL = "https://pocketdecks.top";

const DeckHeadTags = ({ deck }: { deck: NamedDeck & { id: string } }) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const displayName = deckDisplayName(deck);
  // The ja tags must repeat the prerendered strings, or client navigation would
  // replace the copy Googlebot reads with an English default.
  const jaName = friendlyName(deck.id);

  return (
    <>
      {locale === "en" ? (
        <>
          <title>{`${displayName} ${t("deckPage.ogTitleSuffix", "Deck List | Top Pocket Decks")}`}</title>
          <meta
            name="description"
            content={`${displayName} ${t(
              "deckPage.ogDescription",
              "deck list, matchups, and win rate for Pokémon TCG Pocket. See the full card list and how it performs against the current meta."
            )}`}
          />
          <meta
            property="og:title"
            content={`${displayName} ${t("deckPage.ogBrand", "| Top Pocket Decks")}`}
          />
          <meta
            property="og:description"
            content={`${displayName} ${t(
              "deckPage.ogDescriptionShort",
              "deck list, matchups, and win rate for Pokémon TCG Pocket."
            )}`}
          />
        </>
      ) : (
        <>
          <title>{`${jaName} ${JA_DECK_TITLE_SUFFIX}`}</title>
          <meta
            name="description"
            content={`${jaName}${JA_DECK_DESCRIPTION_SUFFIX}`}
          />
        </>
      )}
      <meta property="og:image" content={`${SITE_URL}/og/deck/${deck.id}.png`} />
      <meta
        property="og:url"
        content={localizedUrl(SITE_URL, locale, `/deck/${deck.id}`)}
      />
    </>
  );
};

export default DeckHeadTags;
