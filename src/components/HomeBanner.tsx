import styled, { keyframes } from "styled-components";
import dateformat from "dateformat";
import { useTranslation } from "react-i18next";
import { LAST_UPDATED } from "../app/last-updated";

const drift = keyframes`
  0% { background-position: 0 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
`;

const StyledHomeBanner = styled.div`
  width: 100%;
  padding: 1rem 2rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--bg);
  background: linear-gradient(
    45deg,
    var(--s),
    var(--a),
    var(--b),
    var(--c),
    var(--d),
    var(--f),
    var(--s)
  );
  background-size: 300% 300%;
  animation: ${drift} 8s ease infinite;
`;

const HomeBanner = () => {
  const { t } = useTranslation();

  return (
    <StyledHomeBanner role="status">
      {t(
        "home.banner",
        "Rankings are current as of {{date}}.",
        {
          date: dateformat(LAST_UPDATED, "d mmmm yyyy"),
        }
      )}
    </StyledHomeBanner>
  );
};

export default HomeBanner;
