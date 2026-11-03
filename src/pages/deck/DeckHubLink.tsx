import styled from "styled-components";
import { Link } from "react-router";
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
  if (!entry) return null;
  return <HubAnchor to={hubHref}>All {hubDisplayName(hubEntries)} variants</HubAnchor>;
};

export default DeckHubLink;
