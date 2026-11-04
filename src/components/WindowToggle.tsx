import { useTranslation } from "react-i18next";
import {
  META_WINDOWS,
  META_WINDOW_LABEL_KEYS,
  isPremiumMetaWindow,
} from "../app/meta-window";
import useIsPremium from "../app/use-is-premium";
import { useMetaWindow } from "../app/use-meta-window";
import NavIcon from "./NavIcon";
import SegmentedControl from "./SegmentedControl";

/** The meta window picker. 10d and 20d are free; 30d and All Time need Premium. */
const WindowToggle = () => {
  const { t } = useTranslation();
  const isPremium = useIsPremium();
  const { window, setWindow } = useMetaWindow();

  const options = META_WINDOWS.map((option) => {
    const locked = isPremiumMetaWindow(option) && !isPremium;
    return {
      value: option,
      locked,
      label: (
        <>
          {t(META_WINDOW_LABEL_KEYS[option])}
          {locked && <NavIcon name="lock" size={14} />}
        </>
      ),
    };
  });

  return (
    <SegmentedControl
      label={t("window.label")}
      options={options}
      value={window}
      onChange={setWindow}
    />
  );
};

export default WindowToggle;
