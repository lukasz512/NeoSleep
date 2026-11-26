# Pattern: Global Error Handling

> `AppError` and error codes live in `packages/shared` — shared by API and frontend.
> FHIR R4 OperationOutcome-aligned codes. WCAG 3.3.1 / 3.3.3 compliant messages.
> Rule: nothing internal (stack, SQL, field names) ever reaches the client.

---

## 1. Shared Types — `packages/shared/src/types/error.ts`

Hoisted here so both `apps/api` and `apps/pwa` import from one place.

```typescript
// FHIR R4 OperationOutcome.issue.code — subset used by NeoCRM
export type ErrorCode =
  | 'not-found'        // 404 — resource does not exist
  | 'forbidden'        // 403 — authenticated but not authorized
  | 'unauthorized'     // 401 — not authenticated
  | 'invalid'          // 400 — validation failed, malformed input
  | 'conflict'         // 409 — e.g. duplicate identity on insert
  | 'processing'       // 500 — unexpected server error

export interface AppError extends Error {
  status:  number
  code:    ErrorCode
  expose:  boolean     // true = message is safe to send to client
  hint?:   string      // WCAG 3.3.3 — what the user can do to fix it (expose=true only)
}

// Factory — use everywhere instead of `new Error()`
export function createError(
  code: ErrorCode,
  message: string,
  hint?: string
): AppError {
  const status = { 'not-found': 404, 'forbidden': 403, 'unauthorized': 401,
                   'invalid': 400, 'conflict': 409, 'processing': 500 }[code]
  const err = new Error(message) as AppError
  err.status = status; err.code = code; err.expose = true; err.hint = hint
  return err
}

// Wire shape — what the API sends to the client
// Matches FHIR OperationOutcome.issue structure
export interface ErrorResponse {
  error: { code: ErrorCode; message: string; hint?: string }
}
```

---

## 2. API Middleware — `apps/api/src/middleware/error.ts`

Registered last in `server.ts` — catches everything thrown in routes and DB functions.

```typescript
import type { Request, Response, NextFunction } from 'express'
import type { AppError } from '@neo/shared'
import { logError } from '../db/platform-errors'

export function errorMiddleware(err: AppError, req: Request, res: Response, _: NextFunction) {
  const status  = err.status ?? 500
  const code    = err.code   ?? 'processing'
  const message = err.expose ? err.message : 'An unexpected error occurred'
  const hint    = err.expose ? err.hint    : undefined

  try {
    await logError({
      tenantSlug: req.session?.tenantSlug,
      userId:     req.session?.userId,
      path:       `${req.method} ${req.path}`,
      code,
      message:    err.message,        // full internal message
      stack:      err.stack,
      // NEVER log req.body — may contain passwords or PII
    })
  } catch (logErr) {
    console.error('[platform.errors] write failed:', (logErr as Error).message)
  }

  res.status(status).json({ error: { code, message, hint } } satisfies ErrorResponse)
}
```

Usage in any route or DB function:
```typescript
import { createError } from '@neo/shared'
// ...
throw createError('not-found', 'HCP not found', 'Check the ID and try again')
```

---

## 3. DB — `platform.errors` Table

```sql
CREATE TABLE platform.errors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_slug TEXT,
  user_id     UUID,
  path        TEXT,          -- 'GET /api/hcps/123'
  code        TEXT,          -- ErrorCode
  message     TEXT,          -- full internal message
  stack       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  -- no updated_at, no deleted_at — errors are immutable audit records
);
CREATE INDEX idx_errors_tenant ON platform.errors(tenant_slug);
CREATE INDEX idx_errors_time   ON platform.errors(created_at DESC);
```

---

## 4. Frontend

### `useAsync.ts` — `packages/shared/composables/useAsync.ts`

Hoisted utility. Every composable uses this — never write try/catch inline.

```typescript
import type { ErrorCode } from '@neo/shared'

function extractErrorCode(e: unknown): ErrorCode {
  const code = (e as { response?: { data?: { error?: { code?: string } } } })
    ?.response?.data?.error?.code
  return (code as ErrorCode) ?? 'processing'
}

export function useAsync<T>() {
  const loading = ref(false)
  const error   = ref<ErrorCode | null>(null)

  async function run(fn: () => Promise<T>): Promise<T | null> {
    loading.value = true; error.value = null
    try   { return await fn() }
    catch (e) { error.value = extractErrorCode(e); return null }
    finally   { loading.value = false }
  }

  return { loading, error, run }
}
```

Usage in any composable:
```typescript
const { loading, error, run } = useAsync<Hcp[]>()
const fetch = () => run(() => api.get('/hcps').then(r => r.data))
```

### `AppErrorAlert.vue` — `packages/ui/components/AppErrorAlert.vue`

Hoisted — one component for every error state in the app. Never write `VAlert` + retry inline.

```vue
<template>
  <VAlert
    v-if="error"
    :type="error.type" :variant="error.variant"
    :icon="error.icon"
  >
    <!-- WCAG 3.3.1 — what went wrong -->
    <VAlertTitle>{{ $t(`errors.${error}.message`) }}</VAlertTitle>
    <!-- WCAG 3.3.3 — how to fix it (from i18n, never from API) -->
    {{ $t(`errors.${error}.hint`) }}
    <template #append>
      <VBtn variant="text" @click="emit('retry')">{{ $t('common.retry') }}</VBtn>
    </template>
  </VAlert>
</template>

<script setup lang="ts">
import type { ErrorCode } from '@neo/shared'
defineProps<{ error: ErrorCode | null }>()
const emit = defineEmits<{ retry: [] }>()
</script>
```

Usage in any view — one line:
```vue
<AppErrorAlert :error="error" @retry="fetch" />
```

### i18n — `packages/i18n/en.json`

```json
{
  "errors": {
    "not-found":    { "message": "Record not found",           "hint": "It may have been deleted." },
    "unauthorized": { "message": "Please log in again",        "hint": "Your session has expired." },
    "invalid":      { "message": "Check your input",           "hint": "Some fields may be missing or invalid." },
    "conflict":     { "message": "This record already exists", "hint": "Search for the existing record." },
    "processing":   { "message": "Something went wrong",       "hint": "Please try again or contact support." }
  }
}
```

---

## Red Flags

- ❌ `res.json({ error: err.message })` without `expose` check — leaks internals
- ❌ `err.stack` in any response — never, regardless of environment
- ❌ `req.body` in `platform.errors` — logs passwords / PII
- ❌ Error strings hardcoded in Vue templates — all through i18n `errors.*`
- ❌ Error state in Pinia store — belongs in `useAsync()` composable, local to the view
