import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetaWindowProvider } from "../../contexts/MetaWindowContext";

const premium = vi.hoisted(() => ({ value: false as boolean | null }));

vi.mock("../../app/use-is-premium", () => ({
  __esModule: true,
  default: () => premium.value,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../NavIcon", () => ({
  __esModule: true,
  default: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import WindowToggle from "../WindowToggle";

const renderToggle = () =>
  render(
    <MetaWindowProvider>
      <WindowToggle />
    </MetaWindowProvider>
  );

const option = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  premium.value = false;
});

describe("WindowToggle", () => {
  it("offers all four windows", () => {
    renderToggle();

    expect(option("window.10d")).toBeInTheDocument();
    expect(option("window.20d")).toBeInTheDocument();
    expect(option("window.30d")).toBeInTheDocument();
    expect(option("window.all")).toBeInTheDocument();
  });

  it("opens on the 20-day window", () => {
    renderToggle();

    expect(option("window.20d")).toHaveAttribute("aria-pressed", "true");
    expect(option("window.10d")).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the toggle group with a translated label", () => {
    renderToggle();

    expect(screen.getByRole("group", { name: "window.label" })).toBeInTheDocument();
  });

  it("locks 30d and All Time for a free viewer", () => {
    renderToggle();

    expect(option("window.30d")).toHaveAttribute("aria-disabled", "true");
    expect(option("window.all")).toHaveAttribute("aria-disabled", "true");
    expect(option("window.10d")).not.toHaveAttribute("aria-disabled");
    expect(screen.getAllByTestId("icon-lock")).toHaveLength(2);
  });

  it("leaves the selection alone when a locked window is clicked", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(option("window.30d"));

    expect(option("window.20d")).toHaveAttribute("aria-pressed", "true");
    expect(option("window.30d")).toHaveAttribute("aria-pressed", "false");
  });

  it("switches windows for a free viewer", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(option("window.10d"));

    expect(option("window.10d")).toHaveAttribute("aria-pressed", "true");
  });

  it("unlocks 30d and All Time for a premium viewer", async () => {
    premium.value = true;
    const user = userEvent.setup();
    renderToggle();

    expect(option("window.30d")).not.toHaveAttribute("aria-disabled");
    expect(screen.queryAllByTestId("icon-lock")).toHaveLength(0);

    await user.click(option("window.all"));

    expect(option("window.all")).toHaveAttribute("aria-pressed", "true");
  });
});
