/**
 * Tenant i18n overlay system.
 *
 * Tenants supply a sparse JSON file under i18n/tenants/<id>/<locale>.json
 * containing only the keys they want to override.  The base messages stay
 * in i18n/{locale}.json and serve as the fallback for every untouched key.
 *
 * Tenant ID resolution order:
 *   1. VITE_TENANT_ID build-time env var  (CI/CD sets this per deployment)
 *   2. Subdomain of current hostname       (dentamed.neosleepcare.com → dentamed)
 *   3. Empty string = no tenant, no override
 */

export function getTenantId(): string {
  const envId = import.meta.env.VITE_TENANT_ID as string | undefined;
  if (envId) return envId;

  const host = window.location.hostname;
  const sub  = host.split(".")[0] ?? "";
  const reserved = new Set(["www", "neosleepcare", "localhost", "uat", "dev", "app", "app-uat", "app-dev"]);
  return reserved.has(sub) ? "" : sub;
}

/**
 * Loads the tenant overlay for one locale.
 * Returns an empty object when the file doesn't exist — no error thrown.
 */
export async function loadTenantOverlay(
  tenantId: string,
  locale: string,
): Promise<Record<string, string>> {
  if (!tenantId) return {};
  try {
    // Dynamic import — Vite will only bundle the file if it exists at build time.
    const mod = await import(`../../../../i18n/tenants/${tenantId}/${locale}.json`);
    return mod.default ?? {};
  } catch {
    return {};
  }
}
