import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { DEFAULT_WINDOW } from "../types/meta-windows";
import { useMetaWindow } from "./use-meta-window";

const useWindowSearchParam = (): void => {
  const { window } = useMetaWindow();
  const [params, setParams] = useSearchParams();
  const current = params.get("window");
  const wanted = window === DEFAULT_WINDOW ? null : window;

  useEffect(() => {
    if (current === wanted) return;
    const next = new URLSearchParams(params);
    if (wanted === null) next.delete("window");
    else next.set("window", wanted);
    setParams(next, { replace: true });
  }, [current, wanted, params, setParams]);
};

export default useWindowSearchParam;
