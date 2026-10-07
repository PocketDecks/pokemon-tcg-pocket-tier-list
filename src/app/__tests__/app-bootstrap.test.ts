import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepareAppMount } from "../app-bootstrap";

describe("prepareAppMount", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-app-visible");
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps prerendered content until the app is ready", () => {
    document.body.innerHTML = '<div id="root"><main>Static page</main></div>';
    const root = document.getElementById("root")!;
    const mount = prepareAppMount(root);

    expect(root.textContent).toBe("Static page");
    expect(mount.mount.id).toBe("app-root");
    expect(mount.mount.style.visibility).toBe("hidden");
  });

  it("swaps the app when the route is ready", () => {
    document.body.innerHTML = '<div id="root"><main>Static page</main></div>';
    const root = document.getElementById("root")!;
    const mount = prepareAppMount(root);
    mount.mount.innerHTML = "<main>Client page</main>";

    mount.swap();

    expect(root.textContent).toBe("");
    expect(mount.mount.textContent).toBe("Client page");
    expect(mount.mount.style.visibility).toBe("");
    expect(document.documentElement.dataset.appVisible).toBe("true");
  });

  it("swaps at the cap", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="root"><main>Static page</main></div>';
    const root = document.getElementById("root")!;
    const mount = prepareAppMount(root);
    mount.startCap(4000);

    vi.advanceTimersByTime(3999);
    expect(root.textContent).toBe("Static page");
    vi.advanceTimersByTime(1);
    expect(root.textContent).toBe("");
  });

  it("mounts immediately when root is empty", () => {
    document.body.innerHTML = '<div id="root"></div>';
    const root = document.getElementById("root")!;
    const mount = prepareAppMount(root);

    expect(mount.mount).toBe(root);
    expect(mount.prerendered).toBe(false);
    expect(document.documentElement.dataset.appVisible).toBe("true");
  });
});
