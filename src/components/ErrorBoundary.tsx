import { Component, ErrorInfo, ReactNode } from "react";
import styled from "styled-components";
import { useTranslation } from "react-i18next";

const Notice = styled.div`
  width: 100%;
  min-height: 30rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 1.6rem;
  padding: 4rem 2rem;
  color: var(--main);
  text-align: center;
`;

const Title = styled.h2`
  font-size: 2.4rem;
  font-weight: 600;
`;

const Message = styled.p`
  font-size: 1.6rem;
  max-width: 44rem;
  opacity: 0.8;
`;

const RetryButton = styled.button`
  font-size: 1.6rem;
  font-weight: 500;
  padding: 1rem 2.4rem;
  border-radius: 1.2rem;
  border: 1px solid var(--main);
  background: transparent;
  color: var(--main);
  cursor: pointer;
`;

export const LoadingNotice = () => {
  return (
    <Notice role="status" aria-busy="true">
      <Message>Loading...</Message>
    </Notice>
  );
};

const ErrorNotice = () => {
  const { t } = useTranslation();
  return (
    <Notice role="alert">
      <Title>{t("loadError.errorTitle")}</Title>
      <Message>{t("loadError.errorMessage")}</Message>
      <RetryButton type="button" onClick={() => window.location.reload()}>
        {t("loadError.reload")}
      </RetryButton>
    </Notice>
  );
};

export const QueryErrorNotice = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <Notice role="alert">
      <Title>{t("loadError.title")}</Title>
      <Message>{t("loadError.message")}</Message>
      <RetryButton type="button" onClick={onRetry}>
        {t("loadError.retry")}
      </RetryButton>
    </Notice>
  );
};

const RetryLine = styled.p`
  padding: 1.2rem 2rem;
  font-size: 1.4rem;
  color: var(--text-muted);

  button {
    margin-inline-start: 1rem;
    color: var(--main);
    text-decoration: underline;
    cursor: pointer;
  }
`;

export const QueryRetryLine = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  return <RetryLine role="status">{t("loadError.message")}<button type="button" onClick={onRetry}>{t("loadError.retry")}</button></RetryLine>;
};

interface Props {
  children: ReactNode;
  resetKeys?: readonly unknown[];
}

interface State {
  hasError: boolean;
  resetKeys?: readonly unknown[];
}

/** Degrades a render-time throw to a notice instead of a blank page. */
class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, resetKeys: this.props.resetKeys };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    const next = props.resetKeys;
    const prev = state.resetKeys;
    if (next === undefined || prev === undefined) return null;
    const changed =
      next.length !== prev.length || next.some((key, index) => key !== prev[index]);
    if (changed) {
      return { hasError: false, resetKeys: next };
    }
    return null;
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught render error:", error, errorInfo.componentStack);
  }

  override render() {
    if (this.state.hasError) return <ErrorNotice />;
    return this.props.children;
  }
}

export default ErrorBoundary;
