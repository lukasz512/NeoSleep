/**
 * Shared Vite PWA config factory for all NeoSleep apps.
 *
 * Usage in vite.config.ts:
 *   import { neoPwaPlugin } from "@neo/pwa/vite-config";
 *   plugins: [ neoPwaPlugin({ name: "NeoSleep Rep", shortName: "NeoSleep", startUrl: "/" }) ]
 *
 * Each app gets its own service worker — this factory just ensures consistent
 * caching strategy and manifest shape across all apps.
 */
import { VitePWA } from "vite-plugin-pwa";
import type { VitePWAOptions } from "vite-plugin-pwa";

interface NeoPwaOptions {
  /** Full app name shown in install prompt */
  name: string;
  /** Short name for home screen icon */
  shortName: string;
  /** start_url — relative, e.g. "/" or "/app/" */
  startUrl?: string;
  /** Description shown in install prompt */
  description?: string;
  /** Brand theme color (default: NeoSleep teal) */
  themeColor?: string;
  /** Brand background color for splash screen (default: NeoSleep dark teal) */
  backgroundColor?: string;
  /** Path to 192x192 icon (default: /icon-192.png) */
  icon192?: string;
  /** Path to 512x512 icon (default: /icon-512.png) */
  icon512?: string;
}

export function neoPwaPlugin(opts: NeoPwaOptions): ReturnType<typeof VitePWA> {
  const config: Partial<VitePWAOptions> = {
    registerType: "autoUpdate",
    includeAssets: ["favicon.ico", "apple-touch-icon.png"],

    manifest: {
      name:             opts.name,
      short_name:       opts.shortName,
      description:      opts.description ?? opts.name,
      start_url:        opts.startUrl ?? "/",
      scope:            "/",
      display:          "standalone",
      orientation:      "portrait",
      theme_color:      opts.themeColor       ?? "#128F83",
      background_color: opts.backgroundColor  ?? "#082A27",
      icons: [
        { src: opts.icon192 ?? "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: opts.icon512 ?? "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: opts.icon512 ?? "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },

    workbox: {
      // Cache app shell + assets
      globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],

      // Network-first for API calls (never cache auth/data)
      runtimeCaching: [
        {
          urlPattern: /^https?:\/\/.*\/api\//,
          handler: "NetworkOnly",
        },
        {
          urlPattern: /^https?:\/\/.*\/auth\//,
          handler: "NetworkOnly",
        },
        // Google Fonts — stale-while-revalidate
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
          handler: "StaleWhileRevalidate",
          options: { cacheName: "google-fonts-stylesheets" },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-webfonts",
            expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
          },
        },
      ],
    },
  };

  return VitePWA(config);
}
