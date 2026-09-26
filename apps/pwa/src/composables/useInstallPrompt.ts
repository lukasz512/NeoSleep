/**
 * "Install app" support (NEO-87).
 *
 * Chromium browsers (Chrome, Edge, Samsung Internet, Android) fire
 * `beforeinstallprompt` once the page is installable; calling `prompt()` on
 * that saved event later shows the native install dialog. The event fires
 * early — often on the login screen, long before the app shell (and its
 * button) mounts — so the listener is registered from main.ts at boot, and
 * the event is kept in module state until the button asks for it.
 *
 * iOS/iPadOS Safari has no such API: installing is only possible by hand
 * (Share → Add to Home Screen), so there the button opens a short how-to.
 *
 * Nothing is offered when the app already runs installed (standalone).
 */
import { computed, ref } from "vue";

/** Not in lib.dom.d.ts — Chromium-only, still a WICG draft. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isBeforeInstallPromptEvent(e: Event): e is BeforeInstallPromptEvent {
  return "prompt" in e && typeof e.prompt === "function";
}

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const installed = ref(false);

/** Running from the home screen / as an installed window already. */
export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return win.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

/**
 * iPhone/iPad Safari, where only the manual Share-sheet route exists. iPadOS
 * reports itself as "Macintosh", so a touch-capable Mac UA counts as iPad.
 * Other iOS browsers (CriOS, FxiOS, EdgiOS) can add to home screen from
 * iOS 16.4 too, through the same Share sheet — the hint applies to them as well.
 */
export function isIosDevice(nav: Navigator = navigator): boolean {
  const ua = nav.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
}

let listening = false;

/** Called once from main.ts, before the app mounts. */
export function initInstallPrompt(win: Window = window): void {
  if (listening) return;
  listening = true;
  installed.value = isStandalone(win);
  win.addEventListener("beforeinstallprompt", (e) => {
    if (!isBeforeInstallPromptEvent(e)) return;
    // Suppress Chrome's own mini-infobar: the app bar button is the entry point.
    e.preventDefault();
    deferredPrompt.value = e;
  });
  win.addEventListener("appinstalled", () => {
    installed.value = true;
    deferredPrompt.value = null;
  });
}

export function useInstallPrompt() {
  const ios = typeof navigator !== "undefined" && isIosDevice();

  /** "prompt" = native dialog available, "ios" = show the how-to, null = hide the button. */
  const mode = computed<"prompt" | "ios" | null>(() => {
    if (installed.value) return null;
    if (deferredPrompt.value) return "prompt";
    return ios ? "ios" : null;
  });

  /** Shows the native dialog; resolves true when the user accepted. */
  async function promptInstall(): Promise<boolean> {
    const event = deferredPrompt.value;
    if (!event) return false;
    // A saved event can only be prompted once — drop it either way.
    deferredPrompt.value = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") installed.value = true;
    return outcome === "accepted";
  }

  return { mode, promptInstall };
}

/** Test-only: reset module state between specs. */
export function __resetInstallPromptForTests(): void {
  deferredPrompt.value = null;
  installed.value = false;
  listening = false;
}
