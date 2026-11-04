import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Premium from "../Premium";
import useIsPremium from "../../app/use-is-premium";
import { MANAGE_SUBSCRIPTION_URL } from "../../app/constants";

const copy = vi.hoisted(
  (): Record<string, string> => ({
    "a11y.closePopup": "Close panel",
    "premium.windDown.headline": "Premium wind-down",
    "premium.windDown.active":
      "Your subscription stays active and keeps renewing until you cancel it. You can cancel any time through the billing portal.",
  })
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => copy[key] ?? key,
  }),
  Trans: ({ i18nKey, components }: { i18nKey: string; components?: ReactNode[] }) => (
    <>
      {copy[i18nKey] ?? i18nKey}
      {components}
    </>
  ),
}));

vi.mock("../../app/use-is-premium", () => ({
  default: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useIsPremium).mockReturnValue(false);
});

describe("Premium", () => {
  it("opens the panel as a named dialog from the remove-ads link and closes it on Escape", async () => {
    const user = userEvent.setup();
    render(<Premium variant="link" linkLabel="Remove ads" />);

    await user.click(screen.getByRole("button", { name: "Remove ads" }));

    const dialog = screen.getByRole("dialog", { name: "Premium wind-down" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove ads" })).toHaveFocus();
  });

  it("states the wind-down and links to the billing portal from the open panel", async () => {
    const user = userEvent.setup();
    render(<Premium variant="link" linkLabel="Remove ads" />);

    await user.click(screen.getByRole("button", { name: "Remove ads" }));

    const dialog = screen.getByRole("dialog", { name: "Premium wind-down" });
    expect(within(dialog).getByText(copy["premium.windDown.active"])).toBeInTheDocument();
    expect(
      within(dialog)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href"))
    ).toContain(MANAGE_SUBSCRIPTION_URL);
  });
});
