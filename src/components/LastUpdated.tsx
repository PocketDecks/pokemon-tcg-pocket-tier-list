import styled, { keyframes } from "styled-components";
import { LAST_UPDATED } from "../app/last-updated";
import dateformat from "dateformat";
import { useTranslation } from "react-i18next";

const pulse = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
`;

const StyledLastUpdated = styled.div`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  font-size: 1.4rem;
  color: var(--main);
  display: flex;
  align-items: center;
  gap: 0.8rem;
`;

const StatusDotContainer = styled.div`
  position: relative;
  width: 0.8rem;
  height: 0.8rem;
`;

const StatusDot = styled.div<{ color: string }>`
  position: absolute;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background-color: ${(props) => props.color};
`;

const PulseRing = styled.div<{ color: string }>`
  position: absolute;
  width: 0.8rem;
  height: 0.8rem;
  border-radius: 50%;
  background-color: ${(props) => props.color};
  animation: ${pulse} 2s infinite;
`;

const LastUpdated = () => {
  const { t } = useTranslation();

  const now = new Date();
  const timeDiff = now.getTime() - LAST_UPDATED.getTime();
  const daysDiff = timeDiff / (1000 * 3600 * 24);

  let dotColor: string;
  if (daysDiff <= 2) {
    dotColor = "var(--status-green)"; // Green
  } else if (daysDiff <= 7) {
    dotColor = "var(--status-orange)"; // Orange
  } else {
    dotColor = "var(--status-red)"; // Red
  }

  return (
    <StyledLastUpdated>
      <StatusDotContainer>
        <StatusDot color={dotColor} />
        <PulseRing color={dotColor} />
      </StatusDotContainer>
      {t("lastUpdated")} {dateformat(LAST_UPDATED, "yyyy/mm/dd h:MM tt")}
    </StyledLastUpdated>
  );
};

export default LastUpdated;
