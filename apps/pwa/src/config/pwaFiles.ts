/**
 * Navigations the service worker must leave to the network (NEO-242).
 * Workbox answers every navigation with index.html by default, so opening a
 * document from public/ in a new tab showed the app instead of the file.
 */
export const NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [/\.pdf$/i];

export function isServedAsFile(path: string): boolean {
  return NAVIGATE_FALLBACK_DENYLIST.some((re) => re.test(path));
}
