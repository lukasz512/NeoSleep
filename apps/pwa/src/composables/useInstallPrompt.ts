/**
 * "Add NeoSleep to this device" (NEO-87, docs/stories/neo-87-install-app.md).
 *
 * Chromium browsers (Chrome, Edge, Samsung Internet — Android, Windows, Mac)
 * fire `beforeinstallprompt` once the page is installable; calling `prompt()`
 * on that saved event later shows the native install dialog. The event fires
 * early — often on the login screen, before the app shell mounts — so the
 * listener is registered from main.ts at boot and the event is kept in
 * module state until the card or the avatar menu asks for it.
 *
 * Every other browser that can install at all only does it by hand (iOS
 * Share sheet, Safari's File → Add to Dock, Firefox Android's menu), so for
 * those the card shows a short device-specific guide instead of a button.
 */
import { computed, ref } from "vue";
import { APP_STORAGE_KEYS } from "../constants";

/** Not in lib.dom.d.ts — Chromium-only, still a WICG draft. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isBeforeInstallPromptEvent(e: Event): e is BeforeInstallPromptEvent {
  return "prompt" in e && typeof e.prompt === "function";
}

// ── Device detection ────────────────────────────────────────────────────────

export type DeviceOs = "ios" | "android" | "mac" | "windows" | "other";
export type DeviceForm = "phone" | "tablet" | "desktop";
export type DeviceBrowser = "chromium" | "safari" | "firefox" | "other";

export interface DeviceInfo {
  os: DeviceOs;
  form: DeviceForm;
  browser: DeviceBrowser;
}

type NavigatorLike = Pick<Navigator, "userAgent" | "maxTouchPoints">;

export function detectDevice(nav: NavigatorLike): DeviceInfo {
  const ua = nav.userAgent;
  // iPadOS 13+ reports itself as desktop Safari on a Mac; only touch gives it away.
  const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  let os: DeviceOs = "other";
  if (iPad || /iPhone|iPod/.test(ua)) os = "ios";
  else if (/Android/.test(ua)) os = "android";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "mac";
  else if (/Windows/.test(ua)) os = "windows";

  let form: DeviceForm = "desktop";
  if (os === "ios") form = iPad ? "tablet" : "phone";
  // Android tablets drop the "Mobile" token from their UA.
  else if (os === "android") form = /Mobile/.test(ua) ? "phone" : "tablet";

  // Order matters: Chromium UAs also contain "Safari", Edge/Samsung contain "Chrome".
  let browser: DeviceBrowser = "other";
  if (/Firefox|FxiOS/.test(ua)) browser = "firefox";
  else if (/Chrome|Chromium|CriOS|Edg|SamsungBrowser/.test(ua)) browser = "chromium";
  else if (/Safari/.test(ua)) browser = "safari";

  return { os, form, browser };
}

/**
 * How this device adds the app:
 * - "prompt"        native dialog (Chromium, any OS)
 * - "ios-share"     Share → Add to Home Screen (every iOS browser uses the Share sheet)
 * - "mac-dock"      Safari on macOS: File → Add to Dock
 * - "android-menu"  Firefox on Android: menu ⋮ → Install
 * - "other-browser" desktop browser that can't install (Firefox) → suggest Edge/Chrome
 * - null            nothing to offer (already installed, or not installable here)
 */
export type InstallMethod = "prompt" | "ios-share" | "mac-dock" | "android-menu" | "other-browser";

export function resolveInstallMethod(device: DeviceInfo, hasPrompt: boolean, installed: boolean): InstallMethod | null {
  if (installed) return null;
  if (hasPrompt) return "prompt";
  if (device.os === "ios") return "ios-share";
  if (device.os === "mac" && device.browser === "safari") return "mac-dock";
  if (device.os === "android" && device.browser === "firefox") return "android-menu";
  if (device.form === "desktop" && device.browser === "firefox") return "other-browser";
  // Chromium without the event: already installed or not eligible yet — stay quiet.
  return null;
}

// ── "Later" schedule ────────────────────────────────────────────────────────

/** The card returns once, this long after the first "Later". */
export const INSTALL_REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export interface InstallCardState {
  /** How many times the user pressed "Later". */
  dismissals: number;
  /** When the last "Later" happened (ms epoch). */
  lastDismissedAt: number | null;
}

/** First visit → show; one "Later" → show again once after 7 days; two → never. */
export function shouldShowInstallCard(state: InstallCardState, now: number): boolean {
  if (state.dismissals === 0) return true;
  if (state.dismissals === 1 && state.lastDismissedAt !== null) {
    return now - state.lastDismissedAt >= INSTALL_REMIND_AFTER_MS;
  }
  return false;
}

function readCardState(): InstallCardState {
  try {
    const raw = localStorage.getItem(APP_STORAGE_KEYS.installCard);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && "dismissals" in parsed && typeof parsed.dismissals === "number") {
      const at = "lastDismissedAt" in parsed && typeof parsed.lastDismissedAt === "number" ? parsed.lastDismissedAt : null;
      return { dismissals: parsed.dismissals, lastDismissedAt: at };
    }
  } catch {
    // benign: blocked/corrupt storage — behave like a first visit.
  }
  return { dismissals: 0, lastDismissedAt: null };
}

function writeCardState(state: InstallCardState): void {
  try {
    localStorage.setItem(APP_STORAGE_KEYS.installCard, JSON.stringify(state));
  } catch {
    // benign: storage blocked — the card may show again next time.
  }
}

// ── Module state ────────────────────────────────────────────────────────────

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const installed = ref(false);
/** The card itself — shared so the avatar menu can open the same one. */
const cardOpen = ref(false);

/** Running from the home screen / as an installed window already. */
export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean }; // iOS-only legacy flag
  return win.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

let listening = false;

/** Called once from main.ts, before the app mounts. */
export function initInstallPrompt(win: Window = window): void {
  if (listening) return;
  listening = true;
  installed.value = isStandalone(win);
  win.addEventListener("beforeinstallprompt", (e) => {
    if (!isBeforeInstallPromptEvent(e)) return;
    // Suppress Chrome's own mini-infobar: our card/menu is the entry point.
    e.preventDefault();
    deferredPrompt.value = e;
  });
  win.addEventListener("appinstalled", () => {
    installed.value = true;
    deferredPrompt.value = null;
    cardOpen.value = false;
  });
}

export function useInstallPrompt(nav: NavigatorLike = navigator) {
  const device = detectDevice(nav);

  const method = computed(() => resolveInstallMethod(device, deferredPrompt.value !== null, installed.value));

  /** Shows the native dialog; resolves true when the user accepted. */
  async function promptInstall(): Promise<boolean> {
    const event = deferredPrompt.value;
    if (!event) return false;
    // A saved event can only be prompted once — drop it either way.
    deferredPrompt.value = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      installed.value = true;
      cardOpen.value = false;
    }
    return outcome === "accepted";
  }

  /** Opens the card automatically after login, if the schedule allows. */
  function maybeOpenCard(now: number = Date.now()): void {
    if (method.value && shouldShowInstallCard(readCardState(), now)) cardOpen.value = true;
  }

  /** "Later": close and remember, so the card returns once after 7 days. */
  function postpone(now: number = Date.now()): void {
    const state = readCardState();
    writeCardState({ dismissals: state.dismissals + 1, lastDismissedAt: now });
    cardOpen.value = false;
  }

  return { device, method, cardOpen, promptInstall, maybeOpenCard, postpone };
}

/** Test-only: reset module state between specs. */
export function __resetInstallPromptForTests(): void {
  deferredPrompt.value = null;
  installed.value = false;
  cardOpen.value = false;
  listening = false;
}
