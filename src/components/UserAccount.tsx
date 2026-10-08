import styled from "styled-components";
import { CONTACT_EMAIL } from "../app/constants";
import { useAuth } from "../contexts/AuthContext";
import Popup from "./Popup";
import { useState } from "react";
import Button from "./Button";
import { useTranslation } from "react-i18next";
import Premium from "./Premium";
import useIsPremium from "../app/use-is-premium";
import NavIcon from "./NavIcon";

const StyledUserAccount = styled.div<{ $compact: boolean }>`
  display: flex;
  flex-direction: ${(props) => (props.$compact ? "column" : "row")};
  align-items: center;
  gap: ${(props) => (props.$compact ? "1.2rem" : "2rem")};

  @media (max-width: 900px) {
    gap: 1rem;
  }
`;

const SignInButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.4rem;
  font-weight: 500;
  padding: 0.8rem 1.6rem;
  border-radius: 0.8rem;
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
    min-height: 4.4rem;
  }
`;

const CompactSignInButton = styled(SignInButton)`
  width: 4.4rem;
  height: 4.4rem;
  padding: 0;
  justify-content: center;
  border-radius: 1.2rem;
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

const ButtonContainer = styled.div`
  margin-top: 3rem;
`;

const ContactButton = styled.button`
  cursor: pointer;
`;

const ContactIcon = styled(NavIcon)`
  width: 3.4rem;
  height: 3.4rem;
  transform: translateY(0.1rem);

  @media (max-width: 900px) {
    width: 2.6rem;
    height: 2.6rem;
  }
`;

const ContactText = styled.p`
  font-size: 1.8rem;
  margin: 0;
  color: var(--main);
  text-align: center;
`;

const EmailText = styled(ContactText)`
  margin-top: 1rem;
  color: var(--f);
`;

interface Props {
  compact?: boolean;
}

const UserAccount = ({ compact = false }: Props) => {
  const { t } = useTranslation();
  const { user, signOut, signInWithGoogle } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const isPremium = useIsPremium();

  return (
    <>
      <StyledUserAccount $compact={compact}>
        {isPremium && (
          <ContactButton
            onClick={() => setIsContactOpen(true)}
            aria-label={t("premium.features.contact.title")}
          >
            <ContactIcon name="mail" size={34} />
          </ContactButton>
        )}
        {user && (
          <UserInfo onClick={() => setIsOpen(true)}>
            <UserAvatar
              src={user.photoURL || undefined}
              alt={user.displayName || "User"}
            />
          </UserInfo>
        )}
        {!user && !compact && (
          <SignInButton onClick={() => signInWithGoogle()}>
            {t("header.signIn", "Sign in with Google")}
          </SignInButton>
        )}
        {!user && compact && (
          <CompactSignInButton
            onClick={() => signInWithGoogle()}
            aria-label={t("header.signIn", "Sign in with Google")}
            title={t("header.signIn", "Sign in with Google")}
          >
            <NavIcon name="account" />
          </CompactSignInButton>
        )}
        <Premium />
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
          <ButtonContainer>
            <Button wide action={signOut}>
              {t("userAccount.signOut")}
            </Button>
          </ButtonContainer>
        </Popup>
      )}
      <Popup
        width="40rem"
        isOpen={isContactOpen}
        header="premium.features.contact.title"
        close={() => {
          setIsContactOpen(false);
        }}
      >
        <ContactText>{t("premium.features.contact.description")}</ContactText>
        <EmailText>{CONTACT_EMAIL}</EmailText>
      </Popup>
    </>
  );
};

export default UserAccount;
