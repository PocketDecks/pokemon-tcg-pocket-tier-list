import styled from "styled-components";
import { useTranslation } from "react-i18next";
import React from "react";
import Dropdown from "./Dropdown";

const Container = styled.div<{ $mobile: boolean }>`
  position: relative;
  display: flex;
  align-items: center;

  @media (max-width: 900px) {
    display: ${(props) => (props.$mobile ? "flex" : "none")};
  }

  @media (min-width: 901px) {
    display: ${(props) => (props.$mobile ? "none" : "flex")};
  }
`;

const LanguageDropdown = styled(Dropdown)<{ $mobile: boolean }>`
  padding: 0.8rem 2.4rem 0.8rem 1.2rem;
  font-size: 1.4rem;
  background-position: right 0.8rem center;

  ${(props) => props.$mobile && `
    width: 9rem;
    padding-inline: 0.8rem 2.8rem;
    font-size: 1.3rem;
    border-color: var(--line-strong);
    background: var(--fill-hover);
  `}
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

const LanguageSwitcher = ({ mobile = false }: { mobile?: boolean }) => {
  const { i18n, t } = useTranslation();

  return (
    <Container $mobile={mobile}>
      <LanguageDropdown
        $mobile={mobile}
        value={i18n.language}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => i18n.changeLanguage(e.target.value)}
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
