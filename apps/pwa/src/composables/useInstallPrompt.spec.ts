import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInstallPromptForTests,
  initInstallPrompt,
  isIosDevice,
  isStandalone,
  useInstallPrompt,
} from "./useInstallPrompt";

function fakeWindow(standalone = false): Window {
  const target = new EventTarget();
  return Object.assign(target, {
    matchMedia: (q: string) => ({ matches: standalone && q === "(display-mode: standalone)" }),
    navigator: { userAgent: "Chrome", maxTouchPoints: 0 },
  }) as unknown as Window; // minimal Window stand-in: only the members the composable reads
}

function installEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  return { event, prompt };
}

describe("useInstallPrompt", () => {
  beforeEach(() => __resetInstallPromptForTests());
  afterEach(() => __resetInstallPromptForTests());

  it("hides the button until the browser says the app is installable", () => {
    initInstallPrompt(fakeWindow());
    expect(useInstallPrompt().mode.value).toBeNull();
  });

  it("offers the native prompt after beforeinstallprompt and suppresses the browser's own banner", () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    const { event } = installEvent("accepted");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallPrompt().mode.value).toBe("prompt");
  });

  it("hides the button once the user accepts", async () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    const { event, prompt } = installEvent("accepted");
    win.dispatchEvent(event);
    const { mode, promptInstall } = useInstallPrompt();
    await expect(promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(mode.value).toBeNull();
  });

  it("drops a dismissed prompt (it can only be used once)", async () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    win.dispatchEvent(installEvent("dismissed").event);
    const { mode, promptInstall } = useInstallPrompt();
    await expect(promptInstall()).resolves.toBe(false);
    expect(mode.value).toBeNull();
  });

  it("never offers install inside the installed app", () => {
    const win = fakeWindow(true);
    initInstallPrompt(win);
    win.dispatchEvent(installEvent("accepted").event);
    expect(isStandalone(win)).toBe(true);
    expect(useInstallPrompt().mode.value).toBeNull();
  });

  it("hides the button after appinstalled", () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    win.dispatchEvent(installEvent("accepted").event);
    win.dispatchEvent(new Event("appinstalled"));
    expect(useInstallPrompt().mode.value).toBeNull();
  });
});

describe("isIosDevice", () => {
  const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints }) as Navigator;

  it("detects iPhone and iPadOS (which reports as a touch Mac)", () => {
    expect(isIosDevice(nav("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"))).toBe(true);
    expect(isIosDevice(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5))).toBe(true);
  });

  it("does not treat desktop Mac or Android as iOS", () => {
    expect(isIosDevice(nav("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"))).toBe(false);
    expect(isIosDevice(nav("Mozilla/5.0 (Linux; Android 14)", 5))).toBe(false);
  });
});
