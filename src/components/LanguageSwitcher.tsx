import styled from "styled-components";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import Dropdown from "./Dropdown";

const Container = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const LanguageDropdown = styled(Dropdown)`
  padding: 0.8rem 2.4rem 0.8rem 1.2rem;
  font-size: 1.4rem;
  background-position: right 0.8rem center;

  @media (max-width: 900px) {
    min-height: 4.4rem;
    padding: 0.8rem 3.2rem 0.8rem 1.4rem;
    font-size: 1.6rem;
    border-radius: 0.8rem;
    border-color: var(--line-strong);

    &:hover {
      border-color: var(--line-strong);
    }
  }
`;

const languages = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "it", name: "Italiano" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "pt", name: "Português" },
  { code: "ro", name: "Română" },
  { code: "zh-CN", name: "简体中文" },
  { code: "zh-TW", name: "繁體中文" },
];

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();

  return (
    <Container>
      <LanguageDropdown
        value={i18n.language}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => i18n.changeLanguage(e.target.value)}
        aria-label={t("a11y.selectLanguage", "Select language")}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </LanguageDropdown>
    </Container>
  );
};

export default LanguageSwitcher;
