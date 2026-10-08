import { useSyncExternalStore } from "react";
import {
  isAppVisible,
  subscribeAppVisible,
} from "./app-bootstrap";

export const useAppVisible = (): boolean =>
  useSyncExternalStore(subscribeAppVisible, isAppVisible, () => false);
