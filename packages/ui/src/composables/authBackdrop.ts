import type { InjectionKey } from "vue";

/**
 * Contract between the app's public layout (e.g. apps/pwa PublicLayout), which
 * owns the shared auth backdrop — medical photo, animated gradient and the
 * breathing orbs (AuthOrbs) — and whichever auth view renders inside it
 * (AuthView). The backdrop lives in the layout, not the view, so it is on
 * screen from the very first paint — including while the router is still
 * checking the session and before the (lazy) view has even mounted.
 */
export interface AuthBackdrop {
  /** Marks one named source as loading (or done). Any active source makes the orbs breathe faster. */
  setBusy(source: string, busy: boolean): void;
  /** Aligns the orbs behind this element (the view's card slot); null returns them to their default spot. */
  registerAnchor(el: HTMLElement | null): void;
  /** Resolves once the orbs have finished popping in — the view stages its card entrance after this. */
  whenEntered(): Promise<void>;
  /** Post-login exit: orbs expand past the screen edges while the background dissolves with them. */
  playExit(): Promise<void>;
}

export const AUTH_BACKDROP_KEY: InjectionKey<AuthBackdrop> = Symbol("authBackdrop");
