import { useTranslation } from "react-i18next";
import { deckDisplayName, type NamedDeck } from "../../app/deck-display";
import { useLocale } from "../../app/locale-link";
import { localizedUrl } from "../../app/locale-route";

const SITE_URL = "https://pocketdecks.top";

const DeckHeadTags = ({ deck }: { deck: NamedDeck & { id: string } }) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const displayName = deckDisplayName(deck);
  // A translated deck page already serves localised tags from the prerender;
  // hoisting these English defaults would replace the copy Googlebot reads.
  const english = locale === "en";

  return (
    <>
      {english && (
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
