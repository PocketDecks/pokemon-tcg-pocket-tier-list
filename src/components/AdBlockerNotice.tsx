import styled from "styled-components";
import useAdBlocked from "../ads/useAdBlocked";
import { useTranslation } from "react-i18next";

const Notice = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 1.2rem 2rem;

  @media (max-width: 900px) {
    padding: 1rem 1.2rem;
  }
`;

const Card = styled.p`
  max-width: 97rem;
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.6;
  color: var(--white-78);
  text-align: center;

  @media (max-width: 900px) {
    font-size: 1.3rem;
  }
`;

const Link = styled.a`
  color: var(--link);
  text-decoration: underline;
  font-weight: 500;
  font-size: inherit;

  &:hover {
    opacity: 0.8;
  }
`;

const UBLOCK_URL = "https://github.com/gorhill/uBlock#ublock-origin-ubo";
const PRIVACY_URL = "https://archive.is/4bjZ6";

const AdBlockerNotice = () => {
  const { t } = useTranslation();
  const blocked = useAdBlocked();
  if (!blocked) return null;

  return (
    <Notice>
      <Card>
        {t("adblocker.lead", "Does your ad blocker")}{" "}
        <Link href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
          {t("adblocker.respect", "respect")}
        </Link>{" "}
        {t(
          "adblocker.middle",
          "your privacy? If you're not sure, I and many others can recommend"
        )}{" "}
        <Link href={UBLOCK_URL} target="_blank" rel="noopener noreferrer">
          {t("adblocker.recommend", "uBlock Origin by Raymond Hill")}
        </Link>
        .{" "}
        {t(
          "adblocker.footer",
          "Obviously not sponsored. Just a genuine concern from a fellow like-minded individual."
        )}
      </Card>
    </Notice>
  );
};

export default AdBlockerNotice;