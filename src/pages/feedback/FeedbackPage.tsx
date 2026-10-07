import { useRef, useState, type FormEvent } from "react";
import styled from "styled-components";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../app/use-auth";
import { useMarkContentReady } from "../../ads/ContentReadyContext";
import Button from "../../components/Button";
import NavIcon, { type NavIconName } from "../../components/NavIcon";
import { submitFeedback } from "../../app/feedback-api";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  FEEDBACK_PAGE_MAX_LENGTH,
  type FeedbackCategory,
} from "../../app/feedback";

type Status = "idle" | "sending" | "sent" | "error" | "limited";

const CATEGORY_ICONS: Record<FeedbackCategory, NavIconName> = {
  idea: "bulb",
  bug: "bug",
  data: "statistics",
  other: "chat",
};

const Wrapper = styled.div`
  width: 100%;
  max-width: 68rem;
  padding: 5.6rem 2.4rem 8rem;
  display: flex;
  flex-direction: column;
  gap: 2.4rem;

  @media (max-width: 900px) {
    padding: 3.2rem 2rem 6.4rem;
  }
`;

const Title = styled.h1`
  font-size: 4.8rem;
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.03em;

  @media (max-width: 900px) {
    font-size: 3.6rem;
  }
`;

const Intro = styled.p`
  max-width: 56ch;
  font-size: 1.7rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
`;

const Panel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  min-height: 20rem;
  padding: 3.2rem;
  border-radius: 1.6rem;
  background: #121210;
  border: 1px solid rgba(255, 255, 255, 0.08);

  @media (max-width: 900px) {
    padding: 2.4rem 2rem;
  }
`;

const StateChip = styled.span<{ $color: string }>`
  display: grid;
  place-items: center;
  width: 4.8rem;
  height: 4.8rem;
  border-radius: 1.2rem;
  background: ${(props) => props.$color};
  color: rgba(0, 0, 0, 0.78);
`;

const PanelTitle = styled.h2`
  font-size: 2.4rem;
  font-weight: 600;
  letter-spacing: -0.01em;
`;

const PanelText = styled.p`
  max-width: 56ch;
  font-size: 1.6rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.72);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
`;

const SignedInAs = styled.p`
  font-size: 1.4rem;
  color: rgba(255, 255, 255, 0.6);
`;

const Fieldset = styled.fieldset`
  border: none;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
`;

const Legend = styled.legend`
  margin-bottom: 1.2rem;
  font-size: 1.6rem;
  font-weight: 600;
`;

const Choices = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;

  @media (max-width: 500px) {
    grid-template-columns: 1fr;
  }
`;

const Choice = styled.label<{ $checked: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 5.2rem;
  padding: 1rem 1.4rem;
  border-radius: 1.2rem;
  border: 1px solid
    ${(props) => (props.$checked ? "var(--main)" : "rgba(255, 255, 255, 0.14)")};
  background: ${(props) => (props.$checked ? "rgba(255, 255, 255, 0.08)" : "transparent")};
  font-size: 1.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 160ms ease-out, background-color 160ms ease-out;

  &:hover {
    border-color: rgba(255, 255, 255, 0.4);
  }

  &:focus-within {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

const FieldLabel = styled.label`
  font-size: 1.6rem;
  font-weight: 600;
`;

const TextArea = styled.textarea<{ $invalid: boolean }>`
  width: 100%;
  min-height: 16rem;
  padding: 1.4rem 1.6rem;
  border-radius: 1.2rem;
  border: 1px solid
    ${(props) => (props.$invalid ? "var(--s)" : "rgba(255, 255, 255, 0.18)")};
  background: var(--bg);
  color: var(--main);
  font-family: inherit;
  font-size: 1.6rem;
  line-height: 1.5;
  resize: vertical;
  transition: border-color 160ms ease-out;

  &::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.36);
  }

  &:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
`;

const FieldMeta = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 1.6rem;
  font-size: 1.3rem;
  color: rgba(255, 255, 255, 0.6);
  font-variant-numeric: tabular-nums;
`;

const ErrorText = styled.p`
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--s);
`;

const Checkbox = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 1.2rem;
  min-height: 4.4rem;
  font-size: 1.5rem;
  line-height: 1.4;
  cursor: pointer;

  input {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    margin-top: 0.1rem;
    accent-color: var(--f);
  }
`;

const HoneyPot = styled.div`
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
`;

const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 1.6rem;
`;

const FeedbackPage = () => {
  const { t } = useTranslation();
  const { user, loading, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [contactOk, setContactOk] = useState(false);
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [showLengthError, setShowLengthError] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useMarkContentReady(true);

  const fromState = (location.state as { from?: unknown } | null)?.from;
  const fromPage = typeof fromState === "string" ? fromState.slice(0, FEEDBACK_PAGE_MAX_LENGTH) : "";
  const trimmedLength = message.trim().length;
  const tooShort = trimmedLength < FEEDBACK_MIN_LENGTH;

  const reset = () => {
    setMessage("");
    setContactOk(false);
    setCategory("idea");
    setShowLengthError(false);
    setStatus("idle");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || status === "sending") return;
    if (tooShort) {
      setShowLengthError(true);
      messageRef.current?.focus();
      return;
    }
    if (website) {
      setStatus("sent");
      return;
    }
    setStatus("sending");
    try {
      await submitFeedback({
        uid: user.uid,
        email: contactOk ? user.email ?? null : null,
        category,
        message: message.trim(),
        contactOk: contactOk && !!user.email,
        page: fromPage,
      });
      setStatus("sent");
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      setStatus(code === "permission-denied" ? "limited" : "error");
    }
  };

  const renderPanel = () => {
    if (loading) return <Panel aria-busy="true" />;

    if (!user) {
      return (
        <Panel>
          <StateChip $color="var(--a)" aria-hidden="true">
            <NavIcon name="lock" size={24} />
          </StateChip>
          <PanelTitle>{t("feedback.signInTitle")}</PanelTitle>
          <PanelText>{t("feedback.signInBody")}</PanelText>
          <Actions>
            <Button action={() => void signInWithGoogle()}>
              {t("header.signIn", "Sign in with Google")}
            </Button>
          </Actions>
        </Panel>
      );
    }

    if (status === "sent") {
      return (
        <Panel role="status">
          <StateChip $color="var(--f)" aria-hidden="true">
            <NavIcon name="check" size={24} />
          </StateChip>
          <PanelTitle>{t("feedback.successTitle")}</PanelTitle>
          <PanelText>
            {t("feedback.successBody")}
            {contactOk && user.email
              ? ` ${t("feedback.successReply", { email: user.email })}`
              : ""}
          </PanelText>
          <Actions>
            <Button action={reset}>{t("feedback.sendAnother")}</Button>
          </Actions>
        </Panel>
      );
    }

    const describedBy = showLengthError && tooShort
      ? "feedback-hint feedback-length-error"
      : "feedback-hint";

    return (
      <Panel>
        <Form onSubmit={handleSubmit} noValidate>
          {user.displayName && (
            <SignedInAs>{t("feedback.signedInAs", { name: user.displayName })}</SignedInAs>
          )}
          <Fieldset>
            <Legend>{t("feedback.categoryLabel")}</Legend>
            <Choices>
              {FEEDBACK_CATEGORIES.map((option) => (
                <Choice key={option} $checked={category === option}>
                  <input
                    type="radio"
                    name="category"
                    value={option}
                    checked={category === option}
                    onChange={() => setCategory(option)}
                  />
                  <NavIcon name={CATEGORY_ICONS[option]} size={20} />
                  {t(`feedback.categories.${option}`)}
                </Choice>
              ))}
            </Choices>
          </Fieldset>

          <Field>
            <FieldLabel htmlFor="feedback-message">{t("feedback.messageLabel")}</FieldLabel>
            <TextArea
              id="feedback-message"
              ref={messageRef}
              value={message}
              maxLength={FEEDBACK_MAX_LENGTH}
              placeholder={t("feedback.messagePlaceholder")}
              aria-describedby={describedBy}
              aria-invalid={showLengthError && tooShort}
              $invalid={showLengthError && tooShort}
              onChange={(event) => setMessage(event.target.value)}
            />
            <FieldMeta>
              <span id="feedback-hint">
                {t("feedback.messageHint", { min: FEEDBACK_MIN_LENGTH })}
              </span>
              <span aria-hidden="true">
                {message.length} / {FEEDBACK_MAX_LENGTH}
              </span>
            </FieldMeta>
            {showLengthError && tooShort && (
              <ErrorText id="feedback-length-error" role="alert">
                {t("feedback.messageTooShort", { min: FEEDBACK_MIN_LENGTH })}
              </ErrorText>
            )}
          </Field>

          {user.email && (
            <Checkbox>
              <input
                type="checkbox"
                checked={contactOk}
                onChange={(event) => setContactOk(event.target.checked)}
              />
              {t("feedback.contactLabel", { email: user.email })}
            </Checkbox>
          )}

          <HoneyPot aria-hidden="true">
            <label>
              Website
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </label>
          </HoneyPot>

          {status === "error" && <ErrorText role="alert">{t("feedback.error")}</ErrorText>}
          {status === "limited" && <ErrorText role="alert">{t("feedback.rateLimited")}</ErrorText>}

          <Actions>
            <Button isLoading={status === "sending"}>{t("feedback.submit")}</Button>
            <VisuallyHidden role="status">
              {status === "sending" ? t("feedback.sending") : ""}
            </VisuallyHidden>
          </Actions>
        </Form>
      </Panel>
    );
  };

  return (
    <Wrapper>
      <Title>{t("feedback.title")}</Title>
      <Intro>{t("feedback.intro")}</Intro>
      {renderPanel()}
    </Wrapper>
  );
};

export default FeedbackPage;
