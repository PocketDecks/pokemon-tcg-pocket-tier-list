import styled from "styled-components";
import { useLocation } from "react-router";
import { useAuth } from "../contexts/AuthContext";
import Popup from "./Popup";
import { useId, useState } from "react";
import Button from "./Button";
import { useTranslation } from "react-i18next";
import Premium from "./Premium";
import useSupporterState from "../app/use-supporter-state";
import { LocaleLink } from "../app/locale-link";
import NavIcon from "./NavIcon";
import SignInFailedNotice from "./SignInFailedNotice";

const StyledUserAccount = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;

  @media (max-width: 900px) {
    flex-direction: row;
    gap: 1rem;
  }
`;

const SignInIcon = styled(NavIcon)`
  @media (max-width: 900px) {
    display: none;
  }
`;

const SignInLabel = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;

  @media (max-width: 900px) {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip-path: none;
  }
`;

const SignInButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  width: 4.4rem;
  height: 4.4rem;
  padding: 0;
  font-size: 1.4rem;
  font-weight: 500;
  border-radius: 1.2rem;
  border: 1px solid var(--white-22);
  background: transparent;
  color: var(--main);
  cursor: pointer;
  white-space: nowrap;

  transition: background-color 160ms ease-out, border-color 160ms ease-out;

  &:hover {
    background: var(--line);
    border-color: var(--white-36);
  }

  @media (max-width: 900px) {
    width: auto;
    min-height: 4.4rem;
    padding: 0.8rem 1.6rem;
    border-radius: 0.8rem;
  }
`;

const HeaderNotice = styled(SignInFailedNotice)`
  max-width: 8rem;
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.2;
  text-align: center;
  color: var(--main);

  @media (max-width: 900px) {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 1.2rem;
    z-index: 60;
    width: max-content;
    max-width: min(24rem, calc(100vw - 2.4rem));
    padding: 0.8rem 1.2rem;
    border: 1px solid var(--line-strong);
    border-radius: 0.8rem;
    background: var(--bg);
    font-size: 1.2rem;
    text-align: left;
  }
`;

const UserInfo = styled.button`
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 1.4rem;
  cursor: pointer;
`;

const UserInfoContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 3rem;
`;

const ProfilePicture = styled.img`
  width: 7rem;
  height: 7rem;
  border-radius: 50%;
`;

const DetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const Text = styled.p`
  font-size: 1.8rem;
  margin: 0;
  color: var(--main);
  font-weight: 500;
`;

const UserAvatar = styled.img`
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;

  @media (max-width: 900px) {
    width: 2.4rem;
    height: 2.4rem;
  }
`;

const SupporterStatus = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 2.4rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
`;

const StatusLabel = styled.span`
  font-size: 1.3rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--white-72);
`;

const StatusValue = styled.p`
  margin: 0;
  font-size: 1.8rem;
  font-weight: 500;
  color: var(--main);
`;

const FeedbackLink = styled(LocaleLink)`
  display: inline-flex;
  align-items: center;
  gap: 0.8rem;
  margin-top: 2.4rem;
  font-size: 1.6rem;
  font-weight: 500;
  color: var(--link);

  &:hover {
    text-decoration: underline;
  }
`;

const ButtonContainer = styled.div`
  margin-top: 2.4rem;
`;

const STATUS_KEYS = {
  expires: "userAccount.supporterActive",
  lifetime: "userAccount.supporterLifetime",
  ended: "userAccount.supporterEnded",
  none: "userAccount.supporterNone",
} as const;

const UserAccount = () => {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const noticeId = useId();
  const { user, signOut, signInWithGoogle, signInFailed } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { state: supporter, expiresAt } = useSupporterState();
  const hasUser = !!user;
  const [wasSignedIn, setWasSignedIn] = useState(hasUser);

  if (wasSignedIn !== hasUser) {
    setWasSignedIn(hasUser);
    if (!hasUser) setIsOpen(false);
  }

  const date =
    expiresAt === null || supporter === "lifetime"
      ? ""
      : new Intl.DateTimeFormat(i18n.language, {
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(expiresAt));

  return (
    <>
      <StyledUserAccount>
        <Premium />
        {user && (
          <UserInfo onClick={() => setIsOpen(true)}>
            <UserAvatar
              src={user.photoURL || undefined}
              alt={user.displayName || "User"}
            />
          </UserInfo>
        )}
        {!user && (
          <SignInButton
            onClick={() => signInWithGoogle()}
            title={t("header.signIn", "Sign in with Google")}
            aria-describedby={signInFailed ? noticeId : undefined}
          >
            <SignInIcon name="account" />
            <SignInLabel>{t("header.signIn", "Sign in with Google")}</SignInLabel>
          </SignInButton>
        )}
        <HeaderNotice id={noticeId} alert />
      </StyledUserAccount>
      {user && (
        <Popup
          width="40rem"
          isOpen={isOpen}
          header="userAccount.title"
          close={() => {
            setIsOpen(false);
          }}
        >
          <UserInfoContainer>
            <ProfilePicture
              src={user.photoURL || undefined}
              alt={user.displayName || "User"}
            />
            <DetailsContainer>
              <Text>{user.displayName}</Text>
              <Text>{user.email}</Text>
            </DetailsContainer>
          </UserInfoContainer>
          {supporter !== "loading" && (
            <SupporterStatus>
              <StatusLabel>{t("premium.title")}</StatusLabel>
              <StatusValue>{t(STATUS_KEYS[supporter], { date })}</StatusValue>
            </SupporterStatus>
          )}
          <FeedbackLink
            to="/feedback"
            state={{ from: pathname }}
            onClick={() => setIsOpen(false)}
          >
            <NavIcon name="chat" size={20} />
            {t("feedback.title")}
          </FeedbackLink>
          <ButtonContainer>
            <Button wide action={signOut}>
              {t("userAccount.signOut")}
            </Button>
          </ButtonContainer>
        </Popup>
      )}
    </>
  );
};

export default UserAccount;
