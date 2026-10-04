import { AppError, DatabaseError } from "../errors.js";
import { DEPLOY_ENV } from "../env.js";
import { withTenant, tenantSlugFromHost } from "./tenant.js";

export interface AppConfig {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  surface_color: string;
  surface_color_dark: string;
  /**
   * Card/panel/modal border radius — tenant-level override.
   * Baseline value comes from platform.company_branding.border_radius_card.
   * Maps to CSS var --brand-radius-card injected by useAppConfig.
   */
  border_radius: string;
  hero_container_style: "compact" | "wide";
  color_scheme: "light" | "dark";
  tenant_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  icon_url: string | null;
  icon_dark_url: string | null;
  font_family: string | null;
  pwa_theme_color: string | null;
  integrations: Record<string, unknown>;
}

export type AppConfigUpdate = Partial<
  Pick<
    AppConfig,
    | "primary_color"
    | "secondary_color"
    | "primary_color_dark"
    | "secondary_color_dark"
    | "surface_color"
    | "surface_color_dark"
    | "border_radius"
    | "logo_url"
    | "logo_dark_url"
    | "icon_url"
    | "icon_dark_url"
    | "font_family"
    | "pwa_theme_color"
    | "hero_container_style"
    | "color_scheme"
    | "tenant_name"
    | "integrations"
  >
>;

const DEFAULT_APP_CONFIG: AppConfig = {
  primary_color: "#1976d2",
  secondary_color: "#2e7d32",
  primary_color_dark: "#42a5f5",
  secondary_color_dark: "#66bb6a",
  surface_color: "#fafafa",
  surface_color_dark: "#121212",
  border_radius: "8px",
  hero_container_style: "compact",
  color_scheme: "light",
  tenant_name: "NeoSleep",
  logo_url: null,
  logo_dark_url: null,
  icon_url: null,
  icon_dark_url: null,
  font_family: null,
  pwa_theme_color: null,
  integrations: {},
};

export async function getAppConfig(): Promise<AppConfig> {
  try {
    const result = await withTenant(tenantSlugFromHost(""), (client) =>
      client.query<AppConfig>(
        `SELECT primary_color, secondary_color, border_radius,
              logo_url, logo_dark_url, icon_url, icon_dark_url,
              font_family, pwa_theme_color,
              COALESCE(integrations, '{}') AS integrations,
              COALESCE(NULLIF(tenant_name, ''), $1) AS tenant_name,
              COALESCE(surface_color, $2) AS surface_color,
              COALESCE(surface_color_dark, $3) AS surface_color_dark,
              COALESCE(NULLIF(hero_container_style, ''), 'compact') AS hero_container_style,
              COALESCE(NULLIF(color_scheme, ''), 'light') AS color_scheme,
              COALESCE(primary_color_dark, $4) AS primary_color_dark,
              COALESCE(secondary_color_dark, $5) AS secondary_color_dark
       FROM app_config LIMIT 1`,
        [DEFAULT_APP_CONFIG.tenant_name, DEFAULT_APP_CONFIG.surface_color, DEFAULT_APP_CONFIG.surface_color_dark, DEFAULT_APP_CONFIG.primary_color_dark, DEFAULT_APP_CONFIG.secondary_color_dark]
      )
    );
    const row = result.rows[0];
    if (!row) return DEFAULT_APP_CONFIG;
    return {
      primary_color:        row.primary_color        ?? DEFAULT_APP_CONFIG.primary_color,
      secondary_color:      row.secondary_color      ?? DEFAULT_APP_CONFIG.secondary_color,
      primary_color_dark:   row.primary_color_dark   ?? DEFAULT_APP_CONFIG.primary_color_dark,
      secondary_color_dark: row.secondary_color_dark ?? DEFAULT_APP_CONFIG.secondary_color_dark,
      border_radius:        row.border_radius        ?? DEFAULT_APP_CONFIG.border_radius,
      surface_color:        row.surface_color        ?? DEFAULT_APP_CONFIG.surface_color,
      surface_color_dark:   row.surface_color_dark   ?? DEFAULT_APP_CONFIG.surface_color_dark,
      hero_container_style: row.hero_container_style === "wide" ? "wide" : "compact",
      color_scheme:         row.color_scheme         === "dark" ? "dark" : "light",
      tenant_name:          row.tenant_name          ?? DEFAULT_APP_CONFIG.tenant_name,
      logo_url:             row.logo_url             ?? null,
      logo_dark_url:        row.logo_dark_url        ?? null,
      icon_url:             row.icon_url             ?? null,
      icon_dark_url:        row.icon_dark_url        ?? null,
      font_family:          row.font_family          ?? null,
      pwa_theme_color:      row.pwa_theme_color      ?? null,
      integrations:         (row.integrations as Record<string, unknown>) ?? {},
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("getAppConfig error:", err);
    return DEFAULT_APP_CONFIG;
  }
}

export async function updateAppConfig(updates: AppConfigUpdate): Promise<AppConfig> {
  const current = await getAppConfig();
  const row = {
    primary_color:        updates.primary_color        ?? current.primary_color,
    secondary_color:      updates.secondary_color      ?? current.secondary_color,
    primary_color_dark:   updates.primary_color_dark   ?? current.primary_color_dark,
    secondary_color_dark: updates.secondary_color_dark ?? current.secondary_color_dark,
    border_radius:        updates.border_radius        ?? current.border_radius,
    logo_url:             updates.logo_url !== undefined ? updates.logo_url : current.logo_url,
    surface_color:        updates.surface_color        ?? current.surface_color,
    hero_container_style: updates.hero_container_style ?? current.hero_container_style,
    color_scheme:         updates.color_scheme         ?? current.color_scheme,
    integrations:         updates.integrations         ?? current.integrations,
  };
  try {
    await withTenant(tenantSlugFromHost(""), async (client) => {
      const result = await client.query(
        `UPDATE app_config SET
          primary_color = $1, secondary_color = $2, primary_color_dark = $3, secondary_color_dark = $4,
          border_radius = $5, logo_url = $6, surface_color = $7, hero_container_style = $8, color_scheme = $9,
          integrations = $10,
          updated_at = now()
         WHERE id = (SELECT id FROM app_config LIMIT 1)`,
        [
          row.primary_color, row.secondary_color, row.primary_color_dark, row.secondary_color_dark,
          row.border_radius, row.logo_url, row.surface_color, row.hero_container_style, row.color_scheme,
          JSON.stringify(row.integrations),
        ]
      );
      if (result.rowCount === 0) {
        await client.query(
          `INSERT INTO app_config
            (primary_color, secondary_color, primary_color_dark, secondary_color_dark,
             border_radius, logo_url, surface_color, hero_container_style, color_scheme, integrations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            row.primary_color, row.secondary_color, row.primary_color_dark, row.secondary_color_dark,
            row.border_radius, row.logo_url, row.surface_color, row.hero_container_style, row.color_scheme,
            JSON.stringify(row.integrations),
          ]
        );
      }
    });
    return { ...current, ...row };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("updateAppConfig", err);
  }
}

// ---------------------------------------------------------------------------
// Lab-orders kill switch (NEO-210): integrations.labOrders.sendEnabled.
//
// Per-tenant, server-side only. Absent key → enabled, EXCEPT on prod, where
// it defaults OFF until an admin turns it on himself after his own test
// (Łukasz, 2026-10-04). Dev stays on by default because dev is used for live
// tests now. An explicit value (either way) always wins over the default.
// ---------------------------------------------------------------------------

/** Test-only override of the prod/dev default rule, without touching the process-wide DEPLOY_ENV
 *  constant (env.ts) that other, unrelated code also reads (e.g. the reconciliation env tag). */
let deployEnvOverrideForTests: "dev" | "prod" | "local" | null = null;
export function __setLabOrdersDeployEnvForTests(env: "dev" | "prod" | "local" | null): void {
  deployEnvOverrideForTests = env;
}

export interface LabOrdersSendConfig {
  /** The effective value, after the prod/dev default rule is applied. */
  sendEnabled: boolean;
  /** Whether `sendEnabled` came from an explicit app_config write, or the default rule. */
  isExplicit: boolean;
}

function readLabOrdersSendEnabled(integrations: Record<string, unknown>): boolean | undefined {
  const labOrders = integrations.labOrders;
  if (!labOrders || typeof labOrders !== "object" || Array.isArray(labOrders)) return undefined;
  const value = (labOrders as Record<string, unknown>).sendEnabled;
  return typeof value === "boolean" ? value : undefined;
}

export async function getLabOrdersSendConfig(): Promise<LabOrdersSendConfig> {
  const config = await getAppConfig();
  const explicit = readLabOrdersSendEnabled(config.integrations);
  if (explicit !== undefined) return { sendEnabled: explicit, isExplicit: true };
  const deployEnv = deployEnvOverrideForTests ?? DEPLOY_ENV;
  return { sendEnabled: deployEnv !== "prod", isExplicit: false };
}

/** Admin toggle (routes/deviceOrders.ts) — merges into `integrations` without touching its other keys. */
export async function setLabOrdersSendEnabled(sendEnabled: boolean): Promise<LabOrdersSendConfig> {
  const current = await getAppConfig();
  const existingLabOrders = current.integrations.labOrders;
  const existing =
    existingLabOrders && typeof existingLabOrders === "object" && !Array.isArray(existingLabOrders)
      ? (existingLabOrders as Record<string, unknown>)
      : {};
  const integrations = { ...current.integrations, labOrders: { ...existing, sendEnabled } };
  await updateAppConfig({ integrations });
  return { sendEnabled, isExplicit: true };
}

// ---------------------------------------------------------------------------
// Doctor Panel switch (NEO-233): integrations.features.doctorPanel.
//
// Same default rule as the lab-orders switch: absent → on in dev/local, off on
// prod, so the tiles reach prod only when an admin turns them on (D2, 2026-10-04:
// released together with tiles ③④). An explicit value always wins.
// ---------------------------------------------------------------------------

function readFeatures(integrations: Record<string, unknown>): Record<string, unknown> {
  const features = integrations.features;
  return features && typeof features === "object" && !Array.isArray(features) ? (features as Record<string, unknown>) : {};
}

export async function isDoctorPanelEnabled(): Promise<boolean> {
  const { integrations } = await getAppConfig();
  const explicit = readFeatures(integrations).doctorPanel;
  if (typeof explicit === "boolean") return explicit;
  return (deployEnvOverrideForTests ?? DEPLOY_ENV) !== "prod";
}

/** Explicit on/off; `null` removes the key so the dev/prod default applies again. */
export async function setDoctorPanelEnabled(enabled: boolean | null): Promise<void> {
  const current = await getAppConfig();
  const features = { ...readFeatures(current.integrations) };
  if (enabled === null) delete features.doctorPanel;
  else features.doctorPanel = enabled;
  await updateAppConfig({ integrations: { ...current.integrations, features } });
}
