import { useTranslation } from "react-i18next";
import { useAuth } from "../app/use-auth";

interface Props {
  id: string;
  alert?: boolean;
  className?: string;
}

const SignInFailedNotice = ({ id, alert = false, className }: Props) => {
  const { t } = useTranslation();
  const { user, signInFailed } = useAuth();

  if (user || !signInFailed) return null;

  return (
    <p id={id} role={alert ? "alert" : undefined} className={className}>
      {t("userAccount.signInFailed")}
    </p>
  );
};

export default SignInFailedNotice;
