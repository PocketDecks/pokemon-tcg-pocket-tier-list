import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Premium from "../Premium";
import useIsPremium from "../../app/use-is-premium";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "premium.windDown.headline": "Premium wind-down",
          "a11y.closePopup": "Close panel",
        } as Record<string, string>
      )[key] ?? key,
  }),
  Trans: () => null,
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
});
