import styled from "styled-components";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { archiveForHub, DECK_ARCHIVE } from "../../app/deck-archive";
import { hubDisplayName } from "../../app/deck-archetype";
import { useLocaleHref } from "../../app/locale-link";

const HubAnchor = styled(Link)`
  display: inline-block;
  color: var(--main);
  font-weight: 600;
  text-decoration: none;
`;

const DeckHubLink = ({ variant }: { variant: string }) => {
  const entry = DECK_ARCHIVE.find((candidate) => candidate.variant === variant);
  const hubEntries = entry ? archiveForHub(entry.hub) : [];
  const hubHref = useLocaleHref(`/deck/${entry?.hub ?? ""}`);
  const { t } = useTranslation();
  if (!entry) return null;
  return <HubAnchor to={hubHref}>{t("deckHub.allVariants", { name: hubDisplayName(hubEntries) })}</HubAnchor>;
};

export default DeckHubLink;
