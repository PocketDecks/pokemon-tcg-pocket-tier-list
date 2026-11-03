import styled from "styled-components";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import { archiveForHub } from "../../app/deck-archive";
import { LocaleLink, useLocaleHref } from "../../app/locale-link";
import { deckSlug } from "../../app/deck-slug";
import { hubDisplayName, hubSeenRange } from "../../app/deck-archetype";
import { useDecks } from "../../app/use-decks";
import { newestExpansion } from "../../app/expansion-policy.mjs";
import { EXPANSIONS_URL } from "../../app/constants";
import NotFoundPage from "../not-found/NotFoundPage";

const Page = styled.main`
  width: 100%;
  max-width: 100rem;
  margin: 0 auto;
  padding: 4rem 2.4rem 8rem;
`;

const Header = styled.header`
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin-bottom: 3.2rem;
`;

const Title = styled.h1`
  font-size: clamp(2.8rem, 5vw, 4.8rem);
  line-height: 1.1;
`;

const Summary = styled.p`
  max-width: 68ch;
  color: var(--text-muted);
  font-size: 1.7rem;
  line-height: 1.6;
`;

const History = styled.p`
  color: var(--text-muted);
  font-size: 1.4rem;
`;

const List = styled.div`
  display: grid;
  gap: 1.2rem;
`;

const Variant = styled(LocaleLink)`
  display: block;
  padding: 1.8rem 2rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  color: inherit;
  text-decoration: none;
  background: var(--surface);

  &:hover {
    border-color: var(--main);
  }
`;

const VariantName = styled.strong`
  display: block;
  margin-bottom: 0.6rem;
  font-size: 1.8rem;
`;

const VariantMeta = styled.span`
  color: var(--text-muted);
  font-size: 1.4rem;
`;

const Actions = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  margin-top: 3rem;
`;

const Action = styled(Link)`
  color: var(--main);
  font-weight: 600;
`;

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(`${date}T00:00:00Z`));

const HubPage = () => {
  const { deckId: hubSlug } = useParams();
  const { decks, metaShareBySlug, loading } = useDecks();
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  const deckFinderHref = useLocaleHref("/deck");
  const variants = hubSlug ? archiveForHub(hubSlug) : [];
  const liveBySlug = new Map((decks ?? []).map((deck) => [deckSlug(deck.name), deck]));
  const powerOf = (variant: string) => liveBySlug.get(variant)?.powerScore ?? -1;
  const liveVariants = variants
    .filter((entry) => liveBySlug.has(entry.variant))
    .sort((a, b) => powerOf(b.variant) - powerOf(a.variant));
  const latest = newestExpansion(EXPANSIONS_URL);
  useMarkContentReady(!loading);

  if (!hubSlug || variants.length === 0) return <NotFoundPage />;

  const name = hubDisplayName(variants);
  const seen = hubSeenRange(variants);

  return (
    <Page>
      <Header>
        <Title>{name} Deck</Title>
        {loading ? null : !decks ? (
          <Summary>
            Live deck statistics are unavailable right now. The archive below is still current
          </Summary>
        ) : liveVariants.length > 0 ? (
          <Summary>
            {liveVariants.length} live {liveVariants.length === 1 ? "variant" : "variants"} in the current meta, with the strongest list shown first
          </Summary>
        ) : (
          <Summary>
            Not in the current {latest?.name ?? "expansion"} meta. Browse the tier list for current deck rankings
          </Summary>
        )}
        <History>
          Seen from {formatDate(seen.firstSeen)} to {formatDate(seen.lastSeen)}
        </History>
      </Header>
      {liveVariants.length > 0 && (
        <List>
          {liveVariants.map((entry) => {
            const deck = liveBySlug.get(entry.variant);
            const share = metaShareBySlug?.[entry.variant]?.share;
            return (
              <Variant key={entry.variant} to={`/deck/${entry.variant}`}>
                <VariantName>{entry.name.replace(/-[a-z0-9]+-\d+/g, "").replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())}</VariantName>
                <VariantMeta>
                  {deck ? `${(deck.expectedWinRate * 100).toFixed(1)}% win rate` : ""}
                  {share === undefined ? "" : ` · ${(share * 100).toFixed(1)}% meta share`}
                </VariantMeta>
              </Variant>
            );
          })}
        </List>
      )}
      <Actions>
        <Action to={tierListHref}>{t("notFound.backToTierList")}</Action>
        {liveVariants.length === 0 && <Action to={deckFinderHref}>{t("notFound.browseDecks")}</Action>}
      </Actions>
    </Page>
  );
};

export default HubPage;
