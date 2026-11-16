import type { ComponentProps } from "react";
import { LocaleLink } from "../app/locale-link";

// Every upgrade prompt links here. Style it with styled(SupporterLink).
type Props = Omit<ComponentProps<typeof LocaleLink>, "to">;

const SupporterLink = (props: Props) => <LocaleLink {...props} to="/premium/" />;

export default SupporterLink;
