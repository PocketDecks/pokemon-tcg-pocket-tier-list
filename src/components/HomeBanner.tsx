import styled, { keyframes } from "styled-components";
import { useTranslation } from "react-i18next";
import { LAST_UPDATED } from "../app/last-updated";
import { formatRankingsDate } from "../app/format-rankings-date";

const drift = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(-66.667%); }
  100% { transform: translateX(0); }
`;

const StyledHomeBanner = styled.div`
  width: 100%;
  padding: 1rem 2rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--on-accent);
  position: relative;
  isolation: isolate;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    top: -100%;
    left: 0;
    width: 300%;
    height: 300%;
    z-index: -1;
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
    animation: ${drift} 8s ease infinite;
  }
`;

const HomeBanner = () => {
  const { t, i18n } = useTranslation();

  return (
    <StyledHomeBanner role="status">
      {t(
        "home.banner",
        "Rankings are current as of {{date}}.",
        {
          date: formatRankingsDate(LAST_UPDATED, i18n.language),
        }
      )}
    </StyledHomeBanner>
  );
};

export default HomeBanner;
