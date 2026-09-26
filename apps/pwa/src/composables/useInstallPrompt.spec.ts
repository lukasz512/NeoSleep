import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetInstallPromptForTests,
  detectDevice,
  initInstallPrompt,
  INSTALL_REMIND_AFTER_MS,
  isStandalone,
  resolveInstallMethod,
  shouldShowInstallCard,
  useInstallPrompt,
  type DeviceInfo,
} from "./useInstallPrompt";
import { APP_STORAGE_KEYS } from "../constants";

const UA = {
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iPadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
};

const nav = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

describe("detectDevice", () => {
  it.each([
    ["iPhone", nav(UA.iPhone, 5), { os: "ios", form: "phone", browser: "safari" }],
    ["iPad (reports as a touch Mac)", nav(UA.iPadOs, 5), { os: "ios", form: "tablet", browser: "safari" }],
    ["Android phone", nav(UA.androidPhone, 5), { os: "android", form: "phone", browser: "chromium" }],
    ["Android tablet", nav(UA.androidTablet, 5), { os: "android", form: "tablet", browser: "chromium" }],
    ["Mac Safari", nav(UA.macSafari), { os: "mac", form: "desktop", browser: "safari" }],
    ["Mac Chrome", nav(UA.macChrome), { os: "mac", form: "desktop", browser: "chromium" }],
    ["Windows Edge", nav(UA.winEdge), { os: "windows", form: "desktop", browser: "chromium" }],
    ["Windows Firefox", nav(UA.winFirefox), { os: "windows", form: "desktop", browser: "firefox" }],
  ])("%s", (_label, n, expected) => {
    expect(detectDevice(n)).toEqual(expected);
  });
});

describe("resolveInstallMethod", () => {
  const d = (n: ReturnType<typeof nav>): DeviceInfo => detectDevice(n);

  it("uses the native dialog whenever the browser offers one (Android, Windows, Mac Chrome)", () => {
    expect(resolveInstallMethod(d(nav(UA.androidPhone, 5)), true, false)).toBe("prompt");
    expect(resolveInstallMethod(d(nav(UA.winEdge)), true, false)).toBe("prompt");
    expect(resolveInstallMethod(d(nav(UA.macChrome)), true, false)).toBe("prompt");
  });

  it("falls back to each device's manual steps", () => {
    expect(resolveInstallMethod(d(nav(UA.iPhone, 5)), false, false)).toBe("ios-share");
    expect(resolveInstallMethod(d(nav(UA.iPadOs, 5)), false, false)).toBe("ios-share");
    expect(resolveInstallMethod(d(nav(UA.macSafari)), false, false)).toBe("mac-dock");
    expect(resolveInstallMethod(d(nav(UA.androidFirefox, 5)), false, false)).toBe("android-menu");
    expect(resolveInstallMethod(d(nav(UA.winFirefox)), false, false)).toBe("other-browser");
  });

  it("offers nothing when installed, or on Chromium before its install event", () => {
    expect(resolveInstallMethod(d(nav(UA.iPhone, 5)), false, true)).toBeNull();
    expect(resolveInstallMethod(d(nav(UA.winEdge)), true, true)).toBeNull();
    expect(resolveInstallMethod(d(nav(UA.winEdge)), false, false)).toBeNull();
  });
});

describe("shouldShowInstallCard — 'Later' comes back once after 7 days", () => {
  const now = 1_800_000_000_000;

  it("shows on the first visit", () => {
    expect(shouldShowInstallCard({ dismissals: 0, lastDismissedAt: null }, now)).toBe(true);
  });

  it("stays hidden for 7 days after the first 'Later', then shows once", () => {
    const at = now - INSTALL_REMIND_AFTER_MS + 1000;
    expect(shouldShowInstallCard({ dismissals: 1, lastDismissedAt: at }, now)).toBe(false);
    expect(shouldShowInstallCard({ dismissals: 1, lastDismissedAt: now - INSTALL_REMIND_AFTER_MS }, now)).toBe(true);
  });

  it("never shows again after the second 'Later'", () => {
    expect(shouldShowInstallCard({ dismissals: 2, lastDismissedAt: now - 10 * INSTALL_REMIND_AFTER_MS }, now)).toBe(false);
  });
});

function fakeWindow(standalone = false): Window {
  const target = new EventTarget();
  return Object.assign(target, {
    matchMedia: (q: string) => ({ matches: standalone && q === "(display-mode: standalone)" }),
    navigator: { userAgent: UA.winEdge, maxTouchPoints: 0 },
  }) as unknown as Window; // minimal Window stand-in: only the members the composable reads
}

function installEvent(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: "web" }) });
  return { event, prompt };
}

describe("useInstallPrompt", () => {
  beforeEach(() => {
    __resetInstallPromptForTests();
    localStorage.clear();
  });
  afterEach(() => __resetInstallPromptForTests());

  it("offers the native dialog after beforeinstallprompt and suppresses the browser's own banner", () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    const { event } = installEvent("accepted");
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallPrompt(nav(UA.winEdge)).method.value).toBe("prompt");
  });

  it("closes the card and hides everything once the user accepts", async () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    const { event, prompt } = installEvent("accepted");
    win.dispatchEvent(event);
    const { method, cardOpen, promptInstall, maybeOpenCard } = useInstallPrompt(nav(UA.winEdge));
    maybeOpenCard();
    expect(cardOpen.value).toBe(true);
    await expect(promptInstall()).resolves.toBe(true);
    expect(prompt).toHaveBeenCalledOnce();
    expect(method.value).toBeNull();
    expect(cardOpen.value).toBe(false);
  });

  it("'Later' is remembered: no card again until 7 days have passed", () => {
    initInstallPrompt(fakeWindow());
    const { cardOpen, maybeOpenCard, postpone } = useInstallPrompt(nav(UA.iPhone, 5));
    const t0 = 1_800_000_000_000;
    maybeOpenCard(t0);
    expect(cardOpen.value).toBe(true);
    postpone(t0);
    expect(cardOpen.value).toBe(false);
    expect(JSON.parse(localStorage.getItem(APP_STORAGE_KEYS.installCard) ?? "{}")).toEqual({ dismissals: 1, lastDismissedAt: t0 });
    maybeOpenCard(t0 + 60_000);
    expect(cardOpen.value).toBe(false);
    maybeOpenCard(t0 + INSTALL_REMIND_AFTER_MS);
    expect(cardOpen.value).toBe(true);
    postpone(t0 + INSTALL_REMIND_AFTER_MS);
    maybeOpenCard(t0 + 100 * INSTALL_REMIND_AFTER_MS);
    expect(cardOpen.value).toBe(false);
  });

  it("never opens the card by itself in an automated browser (e2e/smoke scripts)", () => {
    initInstallPrompt(fakeWindow());
    const { method, cardOpen, maybeOpenCard } = useInstallPrompt({ ...nav(UA.winFirefox), webdriver: true });
    maybeOpenCard();
    expect(method.value).toBe("other-browser");
    expect(cardOpen.value).toBe(false);
  });

  it("never offers anything inside the installed app", () => {
    const win = fakeWindow(true);
    initInstallPrompt(win);
    win.dispatchEvent(installEvent("accepted").event);
    expect(isStandalone(win)).toBe(true);
    const { method, cardOpen, maybeOpenCard } = useInstallPrompt(nav(UA.winEdge));
    maybeOpenCard();
    expect(method.value).toBeNull();
    expect(cardOpen.value).toBe(false);
  });

  it("hides everything after appinstalled", () => {
    const win = fakeWindow();
    initInstallPrompt(win);
    win.dispatchEvent(installEvent("accepted").event);
    win.dispatchEvent(new Event("appinstalled"));
    expect(useInstallPrompt(nav(UA.winEdge)).method.value).toBeNull();
  });
});
