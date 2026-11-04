import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import Popup from "../Popup";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "a11y.closePopup": "Close panel",
          "panel.title": "Panel title",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

const Harness = ({ onClose }: { onClose?: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open panel
      </button>
      <button type="button">Background action</button>
      <Popup
        isOpen={isOpen}
        header="panel.title"
        close={() => {
          setIsOpen(false);
          onClose?.();
        }}
      >
        <button type="button">Inside action</button>
      </Popup>
    </>
  );
};

const CookieNotice = () => (
  <div role="dialog" aria-modal="true" aria-label="Cookie notice">
    <button type="button">Reject all</button>
  </div>
);

const UnmountingTrigger = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasTrigger, setHasTrigger] = useState(true);
  return (
    <>
      {hasTrigger && (
        <button type="button" onClick={() => setIsOpen(true)}>
          Open panel
        </button>
      )}
      <Popup isOpen={isOpen} header="panel.title" close={() => setIsOpen(false)}>
        <button type="button" onClick={() => setHasTrigger(false)}>
          Remove trigger
        </button>
      </Popup>
    </>
  );
};

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: "Open panel" }));
  return screen.getByRole("dialog", { name: "Panel title" });
};

describe("Popup keyboard accessibility", () => {
  it("opens as a modal dialog named by its heading", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openPanel(user);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Panel title");
  });

  it("moves focus to a control inside the dialog when it opens", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openPanel(user);

    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  });

  it("keeps Tab focus inside the dialog, wrapping from the last control to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openPanel(user);
    for (let press = 0; press < 10; press += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("keeps Shift+Tab focus inside the dialog, wrapping from the first control to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openPanel(user);
    for (let press = 0; press < 10; press += 1) {
      await user.tab({ shift: true });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("pulls focus back inside when it lands on a control outside the dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    const outside = document.createElement("button");
    outside.textContent = "Added after opening";
    document.body.appendChild(outside);
    outside.focus();

    expect(screen.getByRole("dialog", { name: "Panel title" })).toContainElement(
      document.activeElement as HTMLElement
    );
    outside.remove();
  });

  it("makes background controls inert while open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);

    expect(
      screen.getByRole("button", { name: "Background action" }).closest("[inert]")
    ).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open panel" }).closest("[inert]")
    ).not.toBeNull();
  });

  it("leaves another open modal, such as the cookie notice, usable while the popup is open", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <div role="dialog" aria-modal="true" aria-label="Cookie notice">
          <button type="button">Reject all</button>
        </div>
      </>
    );

    await openPanel(user);

    expect(screen.getByRole("button", { name: "Reject all" }).closest("[inert]")).toBeNull();
  });

  it("removes the inert state from background controls once closed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("button", { name: "Background action" }).closest("[inert]")
    ).toBeNull();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);

    await openPanel(user);
    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("returns focus to the trigger when closed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Open panel" })).toHaveFocus();
  });

  it("returns focus to the trigger when closed with the localised close button", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Close panel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open panel" })).toHaveFocus();
  });

  it("closes without throwing when the trigger has unmounted while open", async () => {
    const user = userEvent.setup();
    render(<UnmountingTrigger />);

    await openPanel(user);
    await user.click(screen.getByRole("button", { name: "Remove trigger" }));

    expect(() => fireEvent.keyDown(document, { key: "Escape" })).not.toThrow();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open panel" })).not.toBeInTheDocument();
  });

  it("closes when the overlay is clicked but not when the dialog is clicked", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const dialog = await openPanel(user);
    fireEvent.click(within(dialog).getByRole("button", { name: "Inside action" }));
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets focus stay in another open modal outside the popup", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    const rejectAll = screen.getByRole("button", { name: "Reject all" });
    rejectAll.focus();

    expect(rejectAll).toHaveFocus();
  });

  it("moves Tab from the popup's last control to the other open modal's first control", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    await user.tab();
    expect(screen.getByRole("button", { name: "Inside action" })).toHaveFocus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Reject all" })).toHaveFocus();
  });

  it("moves Shift+Tab from the popup's first control to the other open modal's last control", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Reject all" })).toHaveFocus();
  });

  it("wraps Tab from the popup's last control to its first when no other modal is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    await user.tab();
    expect(screen.getByRole("button", { name: "Inside action" })).toHaveFocus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
  });

  it("wraps Shift+Tab from the popup's first control to its last when no other modal is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Inside action" })).toHaveFocus();
  });

  it("does not close the popup on Escape while focus is in another open modal", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    const rejectAll = screen.getByRole("button", { name: "Reject all" });
    rejectAll.focus();
    expect(rejectAll).toHaveFocus();
    fireEvent.keyDown(rejectAll, { key: "Escape" });

    expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();
  });

  it("does not wrap Tab back into the popup while focus is in another open modal", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    const rejectAll = screen.getByRole("button", { name: "Reject all" });
    rejectAll.focus();

    expect(rejectAll).toHaveFocus();
    expect(fireEvent.keyDown(rejectAll, { key: "Tab" })).toBe(true);
  });

  it("still closes on Escape when focus is on the page outside every dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Harness />
        <CookieNotice />
      </>
    );

    await openPanel(user);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Panel title" })).not.toBeInTheDocument();
  });

  it("leaves focus and Tab alone when several closed popups are mounted", () => {
    render(
      <>
        <button type="button">Background action</button>
        <Popup isOpen={false} header="panel.title" close={() => {}}>
          <button type="button">First inside action</button>
        </Popup>
        <Popup isOpen={false} header="panel.title" close={() => {}}>
          <button type="button">Second inside action</button>
        </Popup>
        <Popup isOpen={false} header="panel.title" close={() => {}}>
          <button type="button">Third inside action</button>
        </Popup>
      </>
    );

    const background = screen.getByRole("button", { name: "Background action" });
    background.focus();

    expect(background).toHaveFocus();
    expect(document.querySelector("[inert]")).toBeNull();
    expect(fireEvent.keyDown(background, { key: "Tab" })).toBe(true);
    expect(background).toHaveFocus();
  });
});
