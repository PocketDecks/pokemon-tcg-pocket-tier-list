import styled from "styled-components";
import { SOCIALS, type SocialName } from "../app/constants";

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

const Icon = styled.svg`
  width: 32px;
  height: 32px;
  fill: currentColor;

  @media (max-width: 900px) {
    width: 24px;
    height: 24px;
  }
`;

const GITHUB_PATH =
  "M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z";

const TWITTER_PATH =
  "M16 3.038c-.59.26-1.22.437-1.885.517.677-.407 1.198-1.05 1.443-1.816-.634.375-1.337.648-2.085.795-.598-.638-1.45-1.036-2.396-1.036-1.812 0-3.282 1.468-3.282 3.28 0 .258.03.51.085.75C5.152 5.39 2.733 4.182 1.114 2.1.83 2.583.665 3.147.665 3.75c0 1.14.58 2.143 1.46 2.732-.538-.017-1.045-.165-1.487-.41v.04c0 1.59 1.13 2.918 2.633 3.22-.276.074-.566.114-.865.114-.21 0-.416-.02-.617-.058.418 1.304 1.63 2.253 3.067 2.28-1.124.88-2.54 1.404-4.077 1.404-.265 0-.526-.015-.783-.045 1.453.93 3.178 1.474 5.032 1.474 6.038 0 9.34-5 9.34-9.338 0-.143-.004-.284-.01-.425.64-.463 1.198-1.04 1.638-1.7z";

const brandPaths: Record<SocialName, string> = {
  github: GITHUB_PATH,
  twitter: TWITTER_PATH,
};

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
          <Icon viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d={brandPaths[social.name]} />
          </Icon>
        </Link>
      ))}
    </Container>
  );
};

export default Socials;
