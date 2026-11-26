/// <reference types="vite/client" />

// Typed env for the client site (kept in a .ts module so the repo's TS lint rules apply).
declare global {
  interface ImportMetaEnv {
    /** Public base URL of the media bucket (Cloudflare R2 in production, /media locally). */
    readonly VITE_MEDIA_BASE?: string;
    /** "off" for static previews hosted under a foreign path: language via ?lang=, no redirects. */
    readonly VITE_PATH_ROUTING?: string;
  }
}

export {};
