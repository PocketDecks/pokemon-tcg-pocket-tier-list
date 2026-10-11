import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ShareDeckCode from "../ShareDeckCode";

// jsdom lacks canvas; stand in a labelled image.
vi.mock("qrcode.react", () => ({
  QRCodeCanvas: (props: { title?: string }) => (
    <img aria-label={props.title ?? ""} alt={props.title ?? ""} />
  ),
}));

const CODE = "AAQAAAoAAAoAACgAACgBAg==";

describe("ShareDeckCode", () => {
  beforeAll(async () => {
    await i18n.init();
    await i18n.changeLanguage("en");
    await i18n.loadNamespaces("translation");
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("renders the QR, the raw code and both actions", () => {
    render(<ShareDeckCode deckName="hoopa-ex-b4-103" code={CODE} energyCount={1} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("hoopa"));
    expect(screen.getByText(CODE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /qr/i })).toBeInTheDocument();
  });

  it("copies the raw code when the code itself is tapped", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareDeckCode deckName="tap-deck" code={CODE} energyCount={1} />);
    await userEvent.click(screen.getByRole("button", { name: CODE }));
    expect(writeText).toHaveBeenCalledWith(CODE);
  });

  it("copies the raw code to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareDeckCode deckName="test-deck" code={CODE} energyCount={1} />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(CODE);
  });

  it("shows the energy reminder only when no energy could be inferred", () => {
    render(<ShareDeckCode deckName="bare-deck" code={CODE} energyCount={0} />);
    expect(screen.getByText(/energy/i)).toBeInTheDocument();
  });

  it("clears the copied flag when a regenerated code arrives", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { rerender } = render(
      <ShareDeckCode deckName="regen-deck" code={CODE} energyCount={1} />
    );
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
    rerender(<ShareDeckCode deckName="regen-deck" code={CODE + "A"} energyCount={1} />);
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("does not mark copied when the code changes before the write resolves", async () => {
    let resolveWrite!: () => void;
    const writeText = vi.fn(
      () => new Promise<void>((resolve) => { resolveWrite = resolve; })
    );
    Object.assign(navigator, { clipboard: { writeText } });
    const { rerender } = render(
      <ShareDeckCode deckName="race-deck" code={CODE} energyCount={1} />
    );
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    rerender(<ShareDeckCode deckName="race-deck" code={CODE + "A"} energyCount={1} />);
    resolveWrite();
    await new Promise((r) => setTimeout(r));
    expect(screen.queryByRole("button", { name: /copied/i })).not.toBeInTheDocument();
  });

  it("renders nothing without a code", () => {
    const { container } = render(<ShareDeckCode deckName="x" code={null} energyCount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
