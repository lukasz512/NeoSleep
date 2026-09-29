import type { AppReleaseChannel, AppVersionInfo } from "@stores";

/** Build-time env as Vite exposes it (import.meta.env). Reads VITE_APP_VERSION
 *  (from package.json, see vite.config.ts) and VITE_APP_BUILD / VITE_APP_CHANNEL
 *  (set by CI, see .github/workflows/deploy-pwa.yml). */
export type AppVersionEnv = Readonly<Record<string, unknown>>;

function readString(env: AppVersionEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Turns build-time env into the version shown under the login badge.
 *  Anything missing or malformed degrades to "no build number" / "local"
 *  rather than rendering a broken label. */
export function resolveAppVersion(env: AppVersionEnv): AppVersionInfo {
  const version = readString(env, "VITE_APP_VERSION") || "0.0.0";

  const buildRaw = readString(env, "VITE_APP_BUILD");
  const buildNum = /^\d+$/.test(buildRaw) ? Number(buildRaw) : NaN;
  const build = buildNum >= 1 ? buildNum : null;

  const channelRaw = readString(env, "VITE_APP_CHANNEL");
  const channel: AppReleaseChannel = channelRaw === "prod" || channelRaw === "dev" ? channelRaw : "local";

  return { version, build, channel };
}
