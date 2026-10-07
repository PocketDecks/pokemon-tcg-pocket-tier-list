import styled, { keyframes } from "styled-components";
import dateformat from "dateformat";
import { useTranslation } from "react-i18next";
import { LAST_UPDATED } from "../app/last-updated";

const drift = keyframes`
  0% { transform: translateX(0); }
  50% { transform: translateX(-33.333%); }
  100% { transform: translateX(0); }
`;

const StyledHomeBanner = styled.div`
  width: 100%;
  padding: 1rem 2rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--bg);
  position: relative;
  overflow: hidden;

  &::before {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 300%;
    content: "";
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
    background-size: 33.333% 100%;
    animation: ${drift} 8s ease infinite;
  }

  & > * {
    position: relative;
    z-index: 1;
  }
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
