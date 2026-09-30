/**
 * API server base URL.
 * - Dev (default): empty string = use Vite proxy (/api, /auth → localhost:3000), no CORS.
 * - Prod / phone: set VITE_API_URL in .env (e.g. http://192.168.1.x:3000 for LAN).
 */
export function getApiUrl(): string {
  const env = typeof import.meta !== "undefined"
    ? (import.meta as { env?: { VITE_API_URL?: string; DEV?: boolean } }).env
    : undefined;
  const url = env?.VITE_API_URL;
  if (url !== undefined && url !== "") return url;
  return env?.DEV === true ? "" : "http://localhost:3000";
}
