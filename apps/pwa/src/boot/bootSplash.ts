import { BOOT_SPLASH_ID, DEFERRED_CSS_ATTR } from "./splash";

// Read once at module load (before anything mounts): whichever layout mounts
// first needs to know the backdrop is *already* on screen so it can skip its
// own fade/pop-in and take over seamlessly instead of animating in again.
const initiallyPresent =
  typeof document !== "undefined" && document.getElementById(BOOT_SPLASH_ID) !== null;

const FADE_OUT_MS = 450;
// Never let a stuck stylesheet request keep the splash up forever — past this,
// show the app anyway (possibly still styling in) rather than hang.
const STYLES_TIMEOUT_MS = 10_000;

let stylesReady: Promise<void> = Promise.resolve();

let resolveLifting: () => void = () => {};
const lifting = new Promise<void>((resolve) => {
  resolveLifting = resolve;
  if (!initiallyPresent) resolve();
});

/** True when the page booted with the static HTML splash (see splash.ts) still covering it. */
export function bootedWithSplash(): boolean {
  return initiallyPresent;
}

/**
 * Resolves the moment the splash starts fading off (immediately if there never
 * was one) — the auth view stages its card entrance after this, so the card
 * doesn't zoom in unseen underneath the splash.
 */
export function whenSplashLifts(): Promise<void> {
  return lifting;
}

/** The splash's own finite intro (orbs pop in, background reveal) — its infinite breathing is ignored. */
function introFinished(el: HTMLElement): Promise<void> {
  if (typeof el.getAnimations !== "function") return Promise.resolve();
  const finite = el
    .getAnimations({ subtree: true })
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity);
  return Promise.all(finite.map((animation) => animation.finished.catch(() => undefined))).then(() => undefined);
}

/**
 * Switches the bundle CSS that splash.ts turned into non-blocking preloads
 * back into real stylesheets. Call first thing in main.ts. Resolves (via
 * dismissBootSplash) once every one of them has applied — or failed, or timed
 * out — so the splash never lifts off an unstyled app. No-op in dev, where
 * Vite injects CSS through JS instead of <link> tags.
 */
export function activateDeferredStyles(): void {
  if (typeof document === "undefined") return;
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>(`link[${DEFERRED_CSS_ATTR}]`));
  if (links.length === 0) return;
  const loads = links.map(
    (link) =>
      new Promise<void>((resolve) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => resolve(), { once: true });
        link.rel = "stylesheet";
      }),
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, STYLES_TIMEOUT_MS));
  stylesReady = Promise.race([Promise.all(loads).then(() => undefined), timeout]);
}

/**
 * Fades the static splash out and removes it — once styles are ready and its
 * intro has played out, so the intro is never cut short by a fast load.
 * Idempotent, safe to call from any layout.
 */
export function dismissBootSplash(): void {
  const el = typeof document !== "undefined" ? document.getElementById(BOOT_SPLASH_ID) : null;
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = "true";
  void Promise.all([stylesReady, introFinished(el)]).then(() => {
    resolveLifting();
    el.classList.add("boot-splash--leaving");
    window.setTimeout(() => {
      el.remove();
      document.getElementById(`${BOOT_SPLASH_ID}-style`)?.remove();
    }, FADE_OUT_MS);
  });
}
