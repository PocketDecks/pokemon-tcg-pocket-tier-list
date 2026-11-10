import type { NamedDeck } from "../../app/deck-display";
import { englishDeckHead } from "../../app/deck-head-copy";
import {
  friendlyName,
  JA_DECK_DESCRIPTION_SUFFIX,
  JA_DECK_TITLE_SUFFIX,
} from "../../app/deck-friendly-name";
import { useLocale } from "../../app/locale-link";
import { localizedUrl } from "../../app/locale-route";

const SITE_URL = "https://pocketdecks.top";

const DeckHeadTags = ({ deck }: { deck: NamedDeck & { id: string } }) => {
  const locale = useLocale();
  const englishHead = englishDeckHead(friendlyName(deck.id));
  // Client navigation must repeat the prerendered strings, not English defaults.
  const jaName = friendlyName(deck.id);
  const jaTitle = `${jaName} ${JA_DECK_TITLE_SUFFIX}`;
  const jaDescription = `${jaName}${JA_DECK_DESCRIPTION_SUFFIX}`;

  return (
    <>
      {locale === "en" ? (
        <>
          <title>{englishHead.title}</title>
          <meta
            name="description"
            content={englishHead.description}
          />
          <meta property="og:title" content={englishHead.title} />
          <meta property="og:description" content={englishHead.description} />
        </>
      ) : (
        <>
          <title>{jaTitle}</title>
          <meta name="description" content={jaDescription} />
          <meta property="og:title" content={jaTitle} />
          <meta property="og:description" content={jaDescription} />
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
