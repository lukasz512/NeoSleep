import { describe, it, expect, vi, afterEach } from "vitest";
import { injectBootSplash, BOOT_SPLASH_ID, DEFERRED_CSS_ATTR } from "./splash";

/**
 * NEO-52: the auth backdrop must paint from static HTML before any JS or the
 * ~650 KB bundle CSS has downloaded, and must not lift off an unstyled app.
 */

// Shape of Vite's built index.html head (see dist/index.html).
const BUILT_HTML = `<!doctype html><html><head>
<script type="module" crossorigin src="/assets/index-abc.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
</head><body><div id="app"></div></body></html>`;

describe("injectBootSplash (build-time index.html transform)", () => {
  const html = injectBootSplash(BUILT_HTML);

  it("puts the splash markup first in <body>, before the app root", () => {
    expect(html.indexOf(`id="${BOOT_SPLASH_ID}"`)).toBeGreaterThan(html.indexOf("<body>"));
    expect(html.indexOf(`id="${BOOT_SPLASH_ID}"`)).toBeLessThan(html.indexOf('id="app"'));
  });

  it("inlines its own styles and preloads the background photo", () => {
    expect(html).toContain(`<style id="${BOOT_SPLASH_ID}-style">`);
    expect(html).toMatch(/<link rel="preload" as="image" href="\/brand\/logos\/auth\/auth-bg\.webp"/);
  });

  it("turns the render-blocking bundle stylesheet into a non-blocking preload", () => {
    expect(html).not.toMatch(/<link rel="stylesheet"[^>]*index-abc\.css/);
    expect(html).toContain(`<link rel="preload" as="style" crossorigin href="/assets/index-abc.css" ${DEFERRED_CSS_ATTR}>`);
  });

  it("takes its colors from the brand palette, not hardcoded duplicates", () => {
    expect(html).toContain("--bs-primary: #128F83");
  });
});

describe("bootSplash runtime hand-off", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    vi.resetModules();
    vi.useRealTimers();
  });

  it("keeps the splash up until the deferred stylesheet has loaded, then removes it", async () => {
    vi.useFakeTimers();
    document.head.innerHTML = `<link rel="preload" as="style" href="/a.css" ${DEFERRED_CSS_ATTR}>`;
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div>`;
    const { activateDeferredStyles, dismissBootSplash, bootedWithSplash } = await import("./bootSplash");

    expect(bootedWithSplash()).toBe(true);
    activateDeferredStyles();
    const link = document.querySelector("link")!;
    expect(link.rel).toBe("stylesheet");

    dismissBootSplash();
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.getElementById(BOOT_SPLASH_ID)?.classList.contains("boot-splash--leaving")).toBe(false);

    link.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById(BOOT_SPLASH_ID)?.classList.contains("boot-splash--leaving")).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull();
  });

  it("signals the card entrance only once the splash starts lifting", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div>`;
    const { dismissBootSplash, whenSplashLifts } = await import("./bootSplash");

    let lifted = false;
    void whenSplashLifts().then(() => (lifted = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(lifted).toBe(false);

    dismissBootSplash();
    await vi.advanceTimersByTimeAsync(0);
    expect(lifted).toBe(true);
  });

  it("signals the backdrop exit only once the splash has fully faded and been removed", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div>`;
    const { dismissBootSplash, whenSplashGone } = await import("./bootSplash");

    let gone = false;
    void whenSplashGone().then(() => (gone = true));
    dismissBootSplash();
    await vi.advanceTimersByTimeAsync(100);
    expect(gone).toBe(false);

    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull();
    expect(gone).toBe(true);
  });

  it("does not hold the card back when the page booted without a splash", async () => {
    const { whenSplashLifts } = await import("./bootSplash");
    await expect(whenSplashLifts()).resolves.toBeUndefined();
  });

  it("never hangs on a stylesheet that never loads", async () => {
    vi.useFakeTimers();
    document.head.innerHTML = `<link rel="preload" as="style" href="/a.css" ${DEFERRED_CSS_ATTR}>`;
    document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div>`;
    const { activateDeferredStyles, dismissBootSplash } = await import("./bootSplash");

    activateDeferredStyles();
    dismissBootSplash();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull();
  });
});
