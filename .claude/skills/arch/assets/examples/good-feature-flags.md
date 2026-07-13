# Pattern: Feature Flags

> Feature availability is data, not code. Tenant overrides company; company overrides global.
> Routes enforce on the server. Frontend reads from `useAppConfig()` — decoration only, never a security boundary.

---

## 1. DB — `platform.feature_flags`

```sql
CREATE TABLE platform.feature_flags (
  feature    TEXT    NOT NULL,   -- 'pcf' | 'presentations' | 'hcp_portal' | ...
  scope_type TEXT    NOT NULL,   -- 'global' | 'company' | 'tenant'
  scope_id   TEXT,               -- NULL (global) | company slug | tenant slug
  enabled    BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (feature, scope_type, COALESCE(scope_id, ''))
);

-- Seed: global defaults (plan determines what's on by default)
INSERT INTO platform.feature_flags (feature, scope_type, scope_id, enabled) VALUES
  ('pcf',           'global',  NULL, true),
  ('presentations', 'global',  NULL, true),
  ('hcp_portal',    'global',  NULL, false);

-- Company override: NeoSleep gets hcp_portal early
INSERT INTO platform.feature_flags VALUES ('hcp_portal', 'company', 'neosleep', true);

-- Tenant override: neosleep_mx disables presentations
INSERT INTO platform.feature_flags VALUES ('presentations', 'tenant', 'neosleep_mx', false);
```

---

## 2. DB Query — `apps/api/src/db/feature-flags.ts`

Tenant wins over company wins over global. One query, priority via `ORDER BY + DISTINCT ON`.

```typescript
import { withTenant } from './tenant'
import type { RequestContext } from '@neo/shared'

export async function getFeatureFlags(ctx: RequestContext): Promise<Record<string, boolean>> {
  return withTenant(ctx.tenantSlug, async (client) => {
    const { rows } = await client.query<{ feature: string; enabled: boolean }>(`
      SELECT DISTINCT ON (feature) feature, enabled
      FROM platform.feature_flags
      WHERE (scope_type = 'global')
         OR (scope_type = 'company'  AND scope_id = (SELECT company_slug FROM platform.tenants WHERE slug = $1))
         OR (scope_type = 'tenant'   AND scope_id = $1)
      ORDER BY feature,
               CASE scope_type WHEN 'tenant' THEN 1 WHEN 'company' THEN 2 ELSE 3 END
    `, [ctx.tenantSlug])
    return Object.fromEntries(rows.map(r => [r.feature, r.enabled]))
  })
}
```

---

## 3. Route Guard — `apps/api/src/auth.ts`

```typescript
export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const flags = await getFeatureFlags(req.ctx)
    if (!flags[feature]) {
      res.status(403).json({ error: { code: 'forbidden', message: `Feature '${feature}' is not enabled` } })
      return
    }
    next()
  }
}
```

Usage — one line per route:
```typescript
router.post('/observations', requireAuth, requireFeature('pcf'), async (req, res, next) => { ... })
```

---

## 4. Frontend — `useAppConfig()`

Flags are loaded once at boot with the session. Frontend checks are UI decoration — server enforces.

```typescript
// composable returns flags from /api/config (loaded at boot)
const config = useAppConfig()

// In template:
v-if="config.hasFeature('presentations')"

// In composable — guard before fetch:
if (!config.hasFeature('pcf')) return
```

---

## Red Flags

- ❌ Feature check only on the frontend — frontend is decoration, server must enforce
- ❌ Feature names hardcoded across multiple files — define as `const FEATURES = { pcf: 'pcf' }` in `packages/shared`
- ❌ `enabled` driven by plan tier in code (`if plan === 'pro'`) — belongs in `feature_flags` rows, not code
- ❌ New tenant missing default flags — onboarding must copy plan's defaults into `feature_flags` on tenant creation
