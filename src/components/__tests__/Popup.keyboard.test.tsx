import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import Popup from "../Popup";
import { heldInertCount, openPopupCount } from "../popup-state";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        {
          "a11y.closePopup": "Close panel",
          "panel.title": "Panel title",
          "inner.title": "Inner panel",
        } as Record<string, string>
      )[key] ?? key,
  }),
}));

const NestedHarness = () => {
  const [isOuterOpen, setIsOuterOpen] = useState(false);
  const [isInnerOpen, setIsInnerOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOuterOpen(true)}>
        Open outer
      </button>
      <Popup isOpen={isOuterOpen} header="panel.title" close={() => setIsOuterOpen(false)}>
        <button type="button" onClick={() => setIsInnerOpen(true)}>
          Open inner
        </button>
        <Popup isOpen={isInnerOpen} header="inner.title" close={() => setIsInnerOpen(false)}>
          <button type="button">Inner action</button>
        </Popup>
      </Popup>
    </>
  );
};

const TwoPopupsHarness = () => {
  const [isOpenA, setIsOpenA] = useState(false);
  const [isOpenB, setIsOpenB] = useState(false);
  return (
    <>
      <button type="button">Background action</button>
      <button type="button" onClick={() => setIsOpenA(true)}>
        Open A
      </button>
      <button type="button" onClick={() => setIsOpenB(true)}>
        Open B
      </button>
      <Popup isOpen={isOpenA} header="panel.title" close={() => setIsOpenA(false)}>
        <button type="button">A inside action</button>
      </Popup>
      <Popup isOpen={isOpenB} header="inner.title" close={() => setIsOpenB(false)}>
        <button type="button">B inside action</button>
      </Popup>
    </>
  );
};

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

const PopupWithTrigger = ({ name }: { name: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        {`Open ${name}`}
      </button>
      <Popup isOpen={isOpen} header="panel.title" close={() => setIsOpen(false)}>
        <button type="button">{`${name} inside action`}</button>
      </Popup>
    </>
  );
};

const RemovableModalHarness = ({ showNotice }: { showNotice: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open panel
      </button>
      <Popup isOpen={isOpen} header="panel.title" close={() => setIsOpen(false)}>
        <button type="button">Inside action</button>
      </Popup>
      {showNotice && (
        <div role="dialog" aria-modal="true" aria-label="Notice">
          <button type="button">Dismiss notice</button>
        </div>
      )}
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

  it("moves Tab through the popup's controls in order, wrapping from the last to the first", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    const expected = ["Inside action", "Close panel"];
    for (let press = 0; press < 10; press += 1) {
      await user.tab();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: expected[press % 2] })
      );
    }
  });

  it("moves Shift+Tab through the popup's controls in reverse, wrapping from the first to the last", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await openPanel(user);
    const expected = ["Inside action", "Close panel"];
    for (let press = 0; press < 10; press += 1) {
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: expected[press % 2] })
      );
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

  it("keeps a background element that was already inert inert after the popup closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const background = screen.getByRole("button", { name: "Background action" });
    background.setAttribute("inert", "");

    await openPanel(user);
    await user.keyboard("{Escape}");

    expect(background).toHaveAttribute("inert");
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

  it("skips a hidden last control when Shift+Tab wraps into the popup", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Open hidden</button>
        <Popup isOpen header="panel.title" close={() => {}}>
          <button type="button">Visible action</button>
          <button type="button" hidden>
            Hidden action
          </button>
        </Popup>
      </>
    );

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Visible action" })).toHaveFocus();
  });

  it("wraps Shift+Tab into a summary that is the popup's last control", async () => {
    const user = userEvent.setup();
    render(
      <Popup isOpen header="panel.title" close={() => {}}>
        <iframe title="Embedded page" />
        <details>
          <summary>Details</summary>
          <p>Expanded text</p>
        </details>
      </Popup>
    );

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
    await user.tab({ shift: true });

    expect(screen.getByText("Details")).toHaveFocus();
  });

  it("wraps Shift+Tab into an iframe that is the popup's last control", async () => {
    const user = userEvent.setup();
    render(
      <Popup isOpen header="panel.title" close={() => {}}>
        <summary>Details</summary>
        <iframe title="Embedded page" />
      </Popup>
    );

    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
    await user.tab({ shift: true });

    expect(document.querySelector("iframe")).toHaveFocus();
  });

  it("closes only the inner popup on Escape when popups are nested", async () => {
    const user = userEvent.setup();
    render(<NestedHarness />);

    await user.click(screen.getByRole("button", { name: "Open outer" }));
    await user.click(screen.getByRole("button", { name: "Open inner" }));
    expect(screen.getByRole("dialog", { name: "Inner panel" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Inner panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open inner" })).toHaveFocus();
  });

  it("keeps the background inert until the last of several open popups closes", () => {
    render(<TwoPopupsHarness />);
    const background = screen.getByRole("button", { name: "Background action" });

    fireEvent.click(screen.getByRole("button", { name: "Open A" }));
    fireEvent.click(screen.getByRole("button", { name: "Open B" }));
    const dialogA = screen.getByRole("dialog", { name: "Panel title" });
    fireEvent.click(within(dialogA).getByRole("button", { name: "Close panel" }));

    expect(screen.queryByRole("dialog", { name: "Panel title" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Inner panel" })).toBeInTheDocument();
    expect(background.closest("[inert]")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(background.closest("[inert]")).toBeNull();
    expect(document.querySelector("[inert]")).toBeNull();
  });

  it("makes a button added to the page while a popup is open inert until the popup closes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);

    const added = document.createElement("button");
    added.textContent = "Added after opening";
    document.body.appendChild(added);
    await waitFor(() => expect(added).toHaveAttribute("inert"));

    await user.keyboard("{Escape}");

    expect(added).not.toHaveAttribute("inert");
    added.remove();
  });

  it("leaves no inert element and no held popup when focusing the dialog throws on open", () => {
    const view = render(
      <>
        <button type="button">Background action</button>
        <Popup isOpen={false} header="panel.title" close={() => {}}>
          <button type="button">Inside action</button>
        </Popup>
      </>
    );
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {
      throw new Error("focus blocked");
    });
    try {
      expect(() =>
        view.rerender(
          <>
            <button type="button">Background action</button>
            <Popup isOpen header="panel.title" close={() => {}}>
              <button type="button">Inside action</button>
            </Popup>
          </>
        )
      ).toThrow("focus blocked");
    } finally {
      focus.mockRestore();
    }

    expect(document.querySelector("[inert]")).toBeNull();
    expect(openPopupCount()).toBe(0);
  });

  it("forgets the inert claim for a node added and then removed while a popup is open", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPanel(user);
    const baseline = heldInertCount();

    const transient = document.createElement("button");
    transient.textContent = "Transient";
    document.body.appendChild(transient);
    await waitFor(() => expect(heldInertCount()).toBe(baseline + 1));

    transient.remove();
    await waitFor(() => expect(heldInertCount()).toBe(baseline));
    await user.keyboard("{Escape}");
  });

  it("does not use a press from long before opening as the trigger", () => {
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(1000);
      render(<Harness />);
      const trigger = screen.getByRole("button", { name: "Open panel" });
      fireEvent.pointerDown(trigger);

      now.mockReturnValue(60000);
      fireEvent.click(trigger);
      expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();

      fireEvent.keyDown(document, { key: "Escape" });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).not.toHaveFocus();
    } finally {
      now.mockRestore();
    }
  });

  it("returns focus to a trigger that was pressed but not focused, as Safari does", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open panel" });

    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Panel title" })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
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

  it("pulls focus back into the popup when the second modal holding focus is removed", async () => {
    const user = userEvent.setup();
    const view = render(<RemovableModalHarness showNotice />);
    await openPanel(user);
    const dismiss = screen.getByRole("button", { name: "Dismiss notice" });
    dismiss.focus();
    expect(dismiss).toHaveFocus();

    fireEvent.focusOut(dismiss);
    view.rerender(<RemovableModalHarness showNotice={false} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus());
  });

  it("returns Tab from the other modal's last control to the popup's first control", async () => {
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
    expect(fireEvent.keyDown(rejectAll, { key: "Tab" })).toBe(false);
    expect(screen.getByRole("button", { name: "Close panel" })).toHaveFocus();
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

  it("restores focus to the trigger on each close and leaves nothing inert or trapping with several popups mounted", async () => {
    const user = userEvent.setup();
    render(
      <>
        <PopupWithTrigger name="first" />
        <PopupWithTrigger name="second" />
        <PopupWithTrigger name="third" />
        <button type="button">Background action</button>
      </>
    );
    const trigger = screen.getByRole("button", { name: "Open first" });

    for (let round = 0; round < 2; round += 1) {
      await user.click(trigger);
      expect(screen.getByRole("dialog", { name: "Panel title" })).toContainElement(
        document.activeElement as HTMLElement
      );
      await user.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
      expect(document.querySelector("[inert]")).toBeNull();
    }

    const background = screen.getByRole("button", { name: "Background action" });
    background.focus();
    expect(fireEvent.keyDown(background, { key: "Tab" })).toBe(true);
    expect(background).toHaveFocus();
  });
});
