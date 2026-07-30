import type { InjectionKey } from "vue";

/** Provided by the app's public layout (e.g. PublicLayout), injected by AuthView —
 *  lets the login screen fade the shared page background out as part of its own
 *  post-login exit sequence, before navigating away (see both call sites). */
export const AUTH_BACKGROUND_EXIT_KEY: InjectionKey<() => Promise<void>> = Symbol("authBackgroundExit");
