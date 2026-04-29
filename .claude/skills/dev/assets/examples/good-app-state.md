# Pattern: App State — Composable vs Pinia Store

> Default: composable. Escalate to store only when data must survive navigation or be shared across views.
> Pinia is not a default — it's a promotion.

---

## Decision Tree

```
Does this data need to be shared across multiple views?  ──No──▶  Composable
      │ Yes
      ▼
Does it need to persist when the user navigates away?   ──No──▶  Composable
      │ Yes
      ▼
Does it drive global UI (badge count, sidebar state)?   ──No──▶  Composable
      │ Yes
      ▼
                                                                   Pinia Store
```

---

## Composable — local, destroyed on unmount

`apps/app/src/composables/useHcps.ts`

```typescript
// Data lives here while HcpsView is mounted. Destroyed when user navigates away.
// useAsync() is hoisted from packages/shared — never write try/catch inline
export function useHcps() {
  const hcps              = ref<Hcp[]>([])
  const filters           = ref<HcpFilters>({})
  const { loading, error, run } = useAsync<Hcp[]>()

  async function fetch() {
    hcps.value = await run(() => api.get('/hcps', { params: filters.value }).then(r => r.data)) ?? []
  }

  watch(filters, fetch, { deep: true })
  onMounted(fetch)

  return { hcps, loading, error, filters }
}
```

Used in `HcpsView.vue`:
```typescript
const { hcps, loading, error, filters } = useHcps()
// No import of a global store. No side effects outside this view.
```

---

## Pinia Store — shared, persists navigation

`apps/app/src/stores/auth.ts` — shared across every view, never destroyed.

```typescript
export const useAuthStore = defineStore('auth', () => {
  const user    = ref<User | null>(null)
  const tenant  = ref<string | null>(null)

  async function login(credentials: LoginInput) { ... }
  function logout() { user.value = null; tenant.value = null; router.push('/login') }

  return { user, tenant, login, logout }
})
```

Correct candidates for Pinia:
- `useAuthStore` — current user, tenant, session
- `useThemeStore` — dark/light, persisted to localStorage
- `useAppConfigStore` — nav items, feature flags (loaded once at boot)
- `useNotificationsStore` — unread count badge in sidebar

Wrong candidates for Pinia:
- `useHcpsStore` — list data, filters → use composable
- `useEncountersStore` — view-local data → use composable
- Any data that refreshes per-view → use composable

---

## HTTP Calls — always in composable, never in store

```typescript
// ✅ Correct: HTTP in composable
export function useHcps() {
  async function fetch() { hcps.value = (await api.get('/hcps')).data }
}

// ❌ Wrong: HTTP in Pinia action (exception: auth login/logout only)
export const useHcpsStore = defineStore('hcps', () => {
  async function fetch() { hcps.value = (await api.get('/hcps')).data }  // don't do this
})
```

Exception: `useAuthStore.login()` and `useAuthStore.logout()` — auth state is global and HTTP is justified.

---

## Red Flags

- ❌ Pinia store for list/detail data — data lives too long, stale on re-navigation
- ❌ HTTP calls in store actions (outside auth) — stores are state, not services
- ❌ Composable that imports another composable's reactive state — creates implicit coupling
- ❌ `ref()` at module scope (outside `defineStore`) — becomes a singleton, breaks multi-tenant
