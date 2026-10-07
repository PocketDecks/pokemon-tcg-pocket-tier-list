import styled from "styled-components";
import { SOCIALS } from "../app/constants";

const Container = styled.div`
  display: flex;
  gap: 2rem;

  @media (max-width: 900px) {
    gap: 1.6rem;
  }
`;

const Link = styled.a`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  @media (max-width: 900px) {
    width: 4.4rem;
    height: 4.4rem;
  }
`;

const Icon = styled.img`
  width: 32px;
  height: 32px;

  @media (max-width: 900px) {
    width: 24px;
    height: 24px;
  }
`;

const Socials = () => {
  return (
    <Container>
      {SOCIALS.map((social) => (
        <Link
          key={social.url}
          href={social.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={social.label}
        >
          <Icon src={social.icon} alt={social.alt} />
        </Link>
      ))}
    </Container>
  );
};

export default Socials;
