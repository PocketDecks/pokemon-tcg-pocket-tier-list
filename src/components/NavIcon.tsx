import type { ReactNode } from "react";

export type NavIconName =
  | "tierList"
  | "deckFinder"
  | "bestCards"
  | "expansions"
  | "statistics"
  | "account"
  | "lock"
  | "arrowUp"
  | "arrowDown";

const paths: Record<NavIconName, ReactNode> = {
  tierList: <path d="M4 6h16M4 12h11M4 18h6" />,
  deckFinder: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  bestCards: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M12 8.5l1.1 2.3 2.5.3-1.8 1.7.4 2.5L12 14l-2.2 1.3.4-2.5-1.8-1.7 2.5-.3z" />
    </>
  ),
  expansions: (
    <>
      <path d="M6 4.5l1.5 1 1.5-1 1.5 1 1.5-1 1.5 1 1.5-1 1.5 1 1.5-1v15l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  statistics: <path d="M4 20h16M5 15.5l4.5-5 3.5 3 6-7" />,
  account: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
};

const NavIcon = ({ name, size = 22 }: { name: NavIconName; size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {paths[name]}
  </svg>
);

export default NavIcon;
