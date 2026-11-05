import { lazy, type ComponentType } from "react";

export const lazyRoute = <Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>) => {
  const create = () => lazy(() => load().catch((error: unknown) => {
    Page = create();
    throw error;
  }));
  let Page = create();
  return (props: Props) => <Page {...props} />;
};
