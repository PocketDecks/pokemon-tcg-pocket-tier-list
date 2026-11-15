import { useTranslation } from "react-i18next";
import { useLocaleHref } from "../../app/locale-link";
import {
  EmptyActions,
  EmptyMessage,
  Or,
  Overlay,
  Shrug,
  StyledLink,
  UndoButton,
} from "./deck-page.styles";

interface Props {
  shrug: string;
  message: string;
  onUndo: () => void;
  undoDisabled?: boolean;
}

const DeckEmptyState = ({ shrug, message, onUndo, undoDisabled = false }: Props) => {
  const { t } = useTranslation();
  const tierListHref = useLocaleHref("/tier-list");
  return (
    <Overlay>
      <Shrug>{shrug}</Shrug>
      <EmptyMessage>{message}</EmptyMessage>
      <EmptyActions>
        <UndoButton disabled={undoDisabled} $disabled={undoDisabled} onClick={onUndo}>
          {t("deckPage.undo")}
        </UndoButton>
        <Or>{t("deckPage.or")}</Or>
        <StyledLink to={tierListHref}>{t("deckPage.tryAnotherDeck")}</StyledLink>
      </EmptyActions>
    </Overlay>
  );
};

export default DeckEmptyState;
