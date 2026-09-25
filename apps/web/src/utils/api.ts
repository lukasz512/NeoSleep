import { createApiFetch, type ApiFetchOptions } from "@api";

export type { ApiFetchOptions };

/**
 * API base for the public website. Empty in dev on purpose (Vite proxies /api
 * to the local API). In a production build an empty value means every request
 * hits the static host itself and gets index.html back with a 200 — the silent
 * failure behind NEO-81 — so say so loudly, once, instead.
 */
export function getWebApiBase(): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
  if (!base && import.meta.env.PROD && !warnedMissingBase) {
    warnedMissingBase = true;
    console.error(
      "[api] VITE_API_URL is not set in this build — API calls will hit the website host and fail. Set it in the deploy workflow.",
    );
  }
  return base;
}
let warnedMissingBase = false;

export const apiFetch = createApiFetch({
  getApiBase: getWebApiBase,
});
