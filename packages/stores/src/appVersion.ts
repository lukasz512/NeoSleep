import type { InjectionKey } from "vue";

/** Where a build is running: "prod" and "dev" are CI deploys, "local" is a developer machine. */
export type AppReleaseChannel = "prod" | "dev" | "local";

/** Human-facing app version, e.g. 1.0.0 (build 12). `build` is null outside CI. */
export interface AppVersionInfo {
  version: string;
  build: number | null;
  channel: AppReleaseChannel;
}

/** Provided by the app at startup (see apps/pwa/src/main.ts), injected by
 *  packages/ui's AuthView to show the version under the login card's PWA badge.
 *  Lives here rather than in @ui so plain .ts app code can import it (apps'
 *  tsconfigs include @stores, not @ui). Optional — AuthView renders nothing
 *  when an app doesn't provide it. */
export const APP_VERSION_KEY: InjectionKey<AppVersionInfo> = Symbol("appVersion");
