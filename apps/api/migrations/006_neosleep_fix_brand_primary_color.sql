-- ---------------------------------------------------------------------------
-- neosleep.app_config: 002_seed.sql inserted a generic Material blue
-- (#1565C0) as the primary color instead of NeoSleep's actual brand teal
-- (#128F83, packages/brand/colors.ts / apps/pwa _brand-colors.scss). That
-- placeholder was leaking into every primary-colored surface driven by
-- app_config (bottom nav active state, buttons, PWA theme_color, etc).
-- ---------------------------------------------------------------------------
UPDATE neosleep.app_config
SET
  primary_color      = '#128F83',
  primary_color_dark = '#17b5a5',
  pwa_theme_color    = '#128F83'
WHERE singleton = 'config'
  AND primary_color = '#1565C0';
