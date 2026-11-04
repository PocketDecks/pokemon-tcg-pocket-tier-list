import { useLocale } from "../../app/locale-link";
import { hubHead } from "../../app/deck-friendly-name";

export type HubHeadStatus = "live" | "retired" | "unknown";

const DeckHubHeadTags = ({ name, status }: { name: string; status: HubHeadStatus }) => {
  const locale = useLocale();
  const { title, description } = hubHead(name, status, locale !== "en");
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
    </>
  );
};

export default DeckHubHeadTags;
