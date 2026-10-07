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
  | "arrowDown"
  | "arrowRight"
  | "trophy"
  | "calendar"
  | "sliders"
  | "cardMinus"
  | "versus"
  | "code"
  | "qr"
  | "check"
  | "bulb"
  | "bug"
  | "chat"
  | "info";

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
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5v1.5A3 3 0 0 0 8 10.5M16 6h3v1.5a3 3 0 0 1-3 3M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  cardMinus: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 12h6" />
    </>
  ),
  versus: <path d="M4 8h13M14 4.5L17.5 8 14 11.5M20 16H7M10 12.5L6.5 16l3.5 3.5" />,
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5M13.5 4.5l-3 15" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.01" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  bulb: <path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8v.3h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />,
  bug: (
    <>
      <rect x="7.5" y="8" width="9" height="12" rx="4.5" />
      <path d="M12 11v9M9.5 5.5L11 8M14.5 5.5L13 8M4 13h3.5M16.5 13H20M5 18.5l2.8-1.5M19 18.5l-2.8-1.5M5 8l2.8 1.5M19 8l-2.8 1.5" />
    </>
  ),
  chat: <path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 5z" />,
  qr: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h2.5v2.5M20 14v6h-3M14 18.5V20" />
    </>
  ),
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
