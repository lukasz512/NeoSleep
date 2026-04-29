# Pattern: Multi-Tenant Isolation

> One `withTenant()` call per request. One `req.ctx` set by `requireAuth`. Zero tenant IDs in route code.
> Schema-per-tenant (not `tenant_id` column) — GDPR isolation, B2B billing, per-tenant migrations.

---

## 1. Shared — `packages/shared/src/types/context.ts`

```typescript
export interface RequestContext {
  userId:     string
  tenantSlug: string
  role:       'rep' | 'manager' | 'admin'
  ip:         string   // audit_log only — never from req.body
}
```

---

## 2. DB Wrapper — `services/api/src/db/tenant.ts`

`SET LOCAL` is transaction-scoped — reverts on COMMIT or ROLLBACK. Pool connections are always clean.

```typescript
import { pool } from './connection'
import type { PoolClient } from 'pg'

function sanitizeSlug(slug: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(slug)) throw new Error(`Invalid tenant slug: "${slug}"`)
  return slug
}

export async function withTenant<T>(tenantSlug: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const slug   = sanitizeSlug(tenantSlug)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO "${slug}", public`)
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* non-critical — release() still runs */ }
    throw err
  } finally {
    client.release()
  }
}
```

---

## 3. Auth — `services/api/src/auth.ts`

Typed once. No casts anywhere — session and request shapes declared via module augmentation.

```typescript
import type { Request, Response, NextFunction } from 'express'
import type { RequestContext } from '@neo/shared'

declare global {
  namespace Express {
    interface Request { ctx: RequestContext }
  }
}

declare module 'express-session' {
  interface SessionData {
    userId:     string
    tenantSlug: string
    role:       RequestContext['role']
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const { userId, tenantSlug, role } = req.session
  if (!userId || !tenantSlug || !role) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Please log in again' } })
    return
  }
  req.ctx = { userId, tenantSlug, role, ip: req.ip ?? '' }
  next()
}

export function requireRole(...roles: RequestContext['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.ctx.role)) {
      res.status(403).json({ error: { code: 'forbidden', message: 'Insufficient permissions' } })
      return
    }
    next()
  }
}
```

---

## 4. DB Function Shape — `services/api/src/db/[entity].ts`

`ctx` first. Slug from session. `withTenant` owns the transaction — never call BEGIN/COMMIT inside.
Mutations: write audit_log in the same `withTenant` call — atomically with the change.

```typescript
import type { RequestContext } from '@neo/shared'
import { withTenant } from './tenant'
import { createError } from '@neo/shared'

// Read — list
export async function getEntities(ctx: RequestContext, filters: EntityFilters) {
  return withTenant(ctx.tenantSlug, (client) =>
    client.query<Entity>('SELECT ... FROM entity WHERE deleted_at IS NULL', []).then(r => r.rows)
  )
}

// Mutation — withTenant wraps; audit write is atomic with the change
export async function updateEntity(ctx: RequestContext, id: string, input: UpdateEntityInput) {
  return withTenant(ctx.tenantSlug, async (client) => {
    const { rows } = await client.query<Entity>(
      'UPDATE entity SET ... WHERE id = $1 AND deleted_at IS NULL RETURNING *', [id]
    )
    if (!rows[0]) throw createError('not-found', 'Entity not found')
    await client.query(
      `INSERT INTO audit_log (actor_id, action, resource_type, resource_id, payload)
       VALUES ($1, 'entity.updated', 'entity', $2, $3)`,
      [ctx.userId, id, JSON.stringify(input)]
    )
    return rows[0]
  })
}
```

---

## 5. Route Shape — `services/api/src/routes/[entity].ts`

Thin. `req.ctx` in, `next(e)` out. No session, no business logic.

```typescript
import { Router } from 'express'
import { requireAuth, requireRole } from '../auth'
import { getEntities, updateEntity } from '../db/entity'

const router = Router()

router.get('/',      requireAuth,                               async (req, res, next) => {
  try   { res.json(await getEntities(req.ctx, req.query as EntityFilters)) }
  catch (e) { next(e) }
})

router.patch('/:id', requireAuth, requireRole('manager', 'admin'), async (req, res, next) => {
  try   { res.json(await updateEntity(req.ctx, req.params.id, req.body)) }
  catch (e) { next(e) }
})

export default router
```

---

## Red Flags

- ❌ `tenantSlug` from `req.params` / `req.body` — forgeable; session only
- ❌ `SET search_path` without slug validation — schema injection
- ❌ `SET search_path` (session-level) instead of `SET LOCAL` — pool leaks tenant context
- ❌ Missing `withTenant()` on any DB call — silent cross-tenant data leak
- ❌ `pool.query()` outside `db/*.ts` — bypasses isolation entirely
- ❌ Audit log outside the `withTenant` call — phantom audit on mutation failure
- ❌ `req.session` in a route — use `req.ctx` from `requireAuth`
