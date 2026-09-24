/**
 * Static boot splash, injected into index.html at build/dev time (see
 * bootSplashPlugin in vite.config.ts). It paints the auth backdrop — medical
 * photo, brand gradient and the three breathing orbs — straight from the HTML,
 * before a single byte of the JS bundle has downloaded, parsed or run. Without
 * it the page is an empty <div id="app"> until Vue mounts: on a cold dev server
 * that measured ~22s, on a slow phone network it's however long the bundle
 * takes. Vue then takes over without a visible jump (see bootSplash.ts).
 *
 * Plain CSS only — no JS, no web fonts, no theme logic duplicated from
 * @stores: it follows the OS color scheme, then main.ts stamps
 * <html data-theme> as soon as it runs and the [data-theme] rules win.
 *
 * Relative imports on purpose: vite.config.ts loads this at config time,
 * before any path alias exists.
 */
import { brandColors } from "../../../../packages/brand/colors";
import { BRAND_AUTH_BACKGROUND_URL } from "../../../../packages/brand/logos";

export const BOOT_SPLASH_ID = "boot-splash";

// Geometry mirrors AuthOrbs' default frame (packages/ui/src/components/AuthOrbs.vue)
// so the Vue orbs land exactly where these were. Keep the two in sync.
const css = `
#${BOOT_SPLASH_ID} {
  --bs-primary: ${brandColors.primary};
  --bs-primary-light: ${brandColors.primaryLight};
  --bs-primary-dark: ${brandColors.primaryDark};
  --bs-primary-on-dark: ${brandColors.primaryOnDark};
  --bs-ground: #ffffff;
  --bs-tint: #e8f5f4;
  --bs-mint: #b8edcc;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  overflow: hidden;
  /* Swallows taps while covering — the app may already be mounted but still
     unstyled underneath (see deferBundleCss), and shouldn't be clickable blind. */
  pointer-events: auto;
  background: var(--bs-ground);
  transition: opacity 0.45s ease-out;
}
#${BOOT_SPLASH_ID}.boot-splash--leaving { opacity: 0; pointer-events: none; }
.boot-splash__image {
  position: absolute; inset: 0;
  background: url("${BRAND_AUTH_BACKGROUND_URL}") right center / cover no-repeat;
  filter: saturate(0.75) blur(1px);
  opacity: 0.75;
}
.boot-splash__gradient {
  position: absolute; inset: 0;
  background: linear-gradient(120deg, var(--bs-tint), var(--bs-mint), var(--bs-primary-light), var(--bs-primary), var(--bs-tint));
  background-size: 400% 400%;
  opacity: 0.72;
}
.boot-splash__frame {
  position: absolute;
  top: calc(max(16px, env(safe-area-inset-top)) + clamp(24px, 10vh, 96px) + 115px);
  left: 50%;
  width: min(420px, calc(100% - 64px));
  height: 440px;
  transform: translateX(-50%);
}
.boot-splash__orb {
  position: absolute;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--bs-primary);
  opacity: 0.5;
  animation: boot-splash-breath 2.6s ease-in-out infinite;
}
.boot-splash__orb--big { width: 150%; top: 56%; left: 70%; translate: -50% -50%; }
.boot-splash__orb--medium {
  width: 78%; bottom: 35%; left: -17%;
  background: color-mix(in srgb, var(--bs-primary) 55%, white 45%);
  animation-duration: 2.25s; animation-delay: -0.8s;
}
.boot-splash__orb--small { width: 102%; top: -11%; left: -48%; animation-duration: 1.95s; animation-delay: -1.3s; }
/* Busy pace (the page is loading by definition) — same range AuthOrbs uses
   while busy, so the hand-over to the JS-driven loop doesn't change rhythm. */
@keyframes boot-splash-breath {
  0%, 100% { scale: 1; opacity: 0.34; }
  42% { scale: 1.075; opacity: 0.72; }
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) #${BOOT_SPLASH_ID} { --bs-ground: #111111; }
  :root:not([data-theme="light"]) .boot-splash__image { opacity: 0.55; filter: saturate(0.65) brightness(0.9) blur(1px); }
  :root:not([data-theme="light"]) .boot-splash__gradient {
    background-image: linear-gradient(120deg, #111111, var(--bs-primary-dark), var(--bs-primary-on-dark), var(--bs-primary-dark), #111111);
    opacity: 0.7;
  }
}
:root[data-theme="dark"] #${BOOT_SPLASH_ID} { --bs-ground: #111111; }
:root[data-theme="dark"] .boot-splash__image { opacity: 0.55; filter: saturate(0.65) brightness(0.9) blur(1px); }
:root[data-theme="dark"] .boot-splash__gradient {
  background-image: linear-gradient(120deg, #111111, var(--bs-primary-dark), var(--bs-primary-on-dark), var(--bs-primary-dark), #111111);
  opacity: 0.7;
}
@media (prefers-reduced-motion: reduce) {
  .boot-splash__orb { animation: none; }
  #${BOOT_SPLASH_ID} { transition: none; }
}
`;

const markup = `
<div id="${BOOT_SPLASH_ID}" aria-hidden="true">
  <div class="boot-splash__image"></div>
  <div class="boot-splash__gradient"></div>
  <div class="boot-splash__frame">
    <span class="boot-splash__orb boot-splash__orb--big"></span>
    <span class="boot-splash__orb boot-splash__orb--medium"></span>
    <span class="boot-splash__orb boot-splash__orb--small"></span>
  </div>
</div>`;

/** Marks bundle stylesheets that were turned into non-blocking preloads (see deferBundleCss). */
export const DEFERRED_CSS_ATTR = "data-boot-deferred-css";

/**
 * The built bundle's CSS (~650 KB, mostly Vuetify) is linked in <head> as a
 * render-blocking stylesheet — the browser paints *nothing*, not even the
 * splash above, until it has downloaded. On a slow phone network that alone is
 * seconds of blank white. Turned into a high-priority preload instead, so the
 * splash paints straight away; main.ts switches it back to a stylesheet
 * (activateDeferredStyles in bootSplash.ts) and the splash only fades once it
 * has applied, so the app never shows unstyled.
 */
function deferBundleCss(html: string): string {
  return html.replace(
    /<link rel="stylesheet"([^>]*?)href="([^"]+\.css)"([^>]*)>/g,
    `<link rel="preload" as="style"$1href="$2"$3 ${DEFERRED_CSS_ATTR}>`,
  );
}

/**
 * Inlines the splash into index.html (style + background preload in <head>,
 * markup first thing in <body>) and makes the bundle CSS non-blocking. Runs
 * as a post transform, after Vite has injected the built asset links.
 */
export function injectBootSplash(html: string): string {
  const head = `<link rel="preload" as="image" href="${BRAND_AUTH_BACKGROUND_URL}" fetchpriority="high">\n<style id="${BOOT_SPLASH_ID}-style">${css.replace(/\s*\n\s*/g, " ").trim()}</style>`;
  const withSplash = html.replace("</head>", `${head}\n</head>`).replace("<body>", `<body>${markup}`);
  return deferBundleCss(withSplash);
}
