import { Component, ErrorInfo, ReactNode } from "react";
import styled from "styled-components";

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
  return (
    <Notice role="alert">
      <Title>Something went wrong</Title>
      <Message>
        This part of the site failed to load. Reloading usually fixes it. <i>Usually.</i>
      </Message>
      <RetryButton type="button" onClick={() => window.location.reload()}>
        Reload the page
      </RetryButton>
    </Notice>
  );
};

export const QueryErrorNotice = ({ onRetry }: { onRetry: () => void }) => {
  return (
    <Notice role="alert">
      <Title>Failed to load</Title>
      <Message>Card scores could not be loaded. Try again.</Message>
      <RetryButton type="button" onClick={onRetry}>
        Retry
      </RetryButton>
    </Notice>
  );
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
    if (props.resetKeys !== undefined && state.resetKeys !== props.resetKeys) {
      return { hasError: false, resetKeys: props.resetKeys };
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
