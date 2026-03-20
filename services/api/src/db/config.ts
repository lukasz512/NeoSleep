import { getDb } from "./connection.js";

export interface AppConfig {
  primary_color: string;
  secondary_color: string;
  primary_color_dark: string;
  secondary_color_dark: string;
  border_radius: string;
  surface_color: string;
  hero_container_style: "compact" | "wide";
  color_scheme: "light" | "dark";
  // Branding — all nullable: fall back to static /brand/ assets when not set
  tenant_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  icon_url: string | null;
  icon_dark_url: string | null;
}

export type AppConfigUpdate = Partial<
  Pick<
    AppConfig,
    | "primary_color"
    | "secondary_color"
    | "primary_color_dark"
    | "secondary_color_dark"
    | "border_radius"
    | "logo_url"
    | "surface_color"
    | "hero_container_style"
    | "color_scheme"
  >
>;

const DEFAULT_APP_CONFIG: AppConfig = {
  primary_color: "#1976d2",
  secondary_color: "#2e7d32",
  primary_color_dark: "#42a5f5",
  secondary_color_dark: "#66bb6a",
  border_radius: "8px",
  surface_color: "#fafafa",
  hero_container_style: "compact",
  color_scheme: "light",
  tenant_name: "NeoSleep",
  logo_url: null,
  logo_dark_url: null,
  icon_url: null,
  icon_dark_url: null,
};

export async function getAppConfig(): Promise<AppConfig> {
  const p = getDb();
  if (!p) return DEFAULT_APP_CONFIG;
  try {
    const result = await p.query<AppConfig>(
      `SELECT primary_color, secondary_color, border_radius,
              logo_url, logo_dark_url, icon_url, icon_dark_url,
              COALESCE(NULLIF(tenant_name, ''), $1) AS tenant_name,
              COALESCE(surface_color, $2) AS surface_color,
              COALESCE(NULLIF(hero_container_style, ''), 'compact') AS hero_container_style,
              COALESCE(NULLIF(color_scheme, ''), 'light') AS color_scheme,
              COALESCE(primary_color_dark, $3) AS primary_color_dark,
              COALESCE(secondary_color_dark, $4) AS secondary_color_dark
       FROM tbl_app_config LIMIT 1`,
      [DEFAULT_APP_CONFIG.tenant_name, DEFAULT_APP_CONFIG.surface_color, DEFAULT_APP_CONFIG.primary_color_dark, DEFAULT_APP_CONFIG.secondary_color_dark]
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
      hero_container_style: row.hero_container_style === "wide" ? "wide" : "compact",
      color_scheme:         row.color_scheme         === "dark" ? "dark" : "light",
      tenant_name:          row.tenant_name          ?? DEFAULT_APP_CONFIG.tenant_name,
      logo_url:             row.logo_url             ?? null,
      logo_dark_url:        row.logo_dark_url        ?? null,
      icon_url:             row.icon_url             ?? null,
      icon_dark_url:        row.icon_dark_url        ?? null,
    };
  } catch (err) {
    console.error("getAppConfig error:", err);
    return DEFAULT_APP_CONFIG;
  }
}

export async function updateAppConfig(updates: AppConfigUpdate): Promise<AppConfig> {
  const p = getDb();
  if (!p) return DEFAULT_APP_CONFIG;
  const current = await getAppConfig();
  const row: AppConfig = {
    primary_color:       updates.primary_color       ?? current.primary_color,
    secondary_color:     updates.secondary_color     ?? current.secondary_color,
    primary_color_dark:  updates.primary_color_dark  ?? current.primary_color_dark,
    secondary_color_dark:updates.secondary_color_dark?? current.secondary_color_dark,
    border_radius:       updates.border_radius        ?? current.border_radius,
    logo_url:            updates.logo_url !== undefined ? updates.logo_url : current.logo_url,
    surface_color:       updates.surface_color        ?? current.surface_color,
    hero_container_style:updates.hero_container_style ?? current.hero_container_style,
    color_scheme:        updates.color_scheme         ?? current.color_scheme,
  };
  try {
    const result = await p.query(
      `UPDATE tbl_app_config SET
        primary_color = $1, secondary_color = $2, primary_color_dark = $3, secondary_color_dark = $4,
        border_radius = $5, logo_url = $6, surface_color = $7, hero_container_style = $8, color_scheme = $9,
        updated_at = now()
       WHERE id = (SELECT id FROM tbl_app_config LIMIT 1)`,
      [
        row.primary_color, row.secondary_color, row.primary_color_dark, row.secondary_color_dark,
        row.border_radius, row.logo_url, row.surface_color, row.hero_container_style, row.color_scheme,
      ]
    );
    if (result.rowCount === 0) {
      await p.query(
        `INSERT INTO tbl_app_config
          (primary_color, secondary_color, primary_color_dark, secondary_color_dark,
           border_radius, logo_url, surface_color, hero_container_style, color_scheme)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          row.primary_color, row.secondary_color, row.primary_color_dark, row.secondary_color_dark,
          row.border_radius, row.logo_url, row.surface_color, row.hero_container_style, row.color_scheme,
        ]
      );
    }
    return row;
  } catch (err) {
    console.error("updateAppConfig error:", err);
    return current;
  }
}
