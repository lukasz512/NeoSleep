/**
 * Enforces the architecture boundaries already documented in CLAUDE.md / .claude/skills/arch:
 *   - apps/pwa and apps/web must never reach into apps/api/src directly (BFF trust boundary —
 *     the only sanctioned path in is apps/api/client, aka @neo/api-client / the "@api" alias).
 *   - only apps/api/src/db/** may import the `pg` driver — everything else goes through db/*.ts.
 *   - packages/* must not depend on apps/* (dependency direction is apps -> packages, not back).
 *
 * Run per-app so paths in the rules below (apps/pwa/src, apps/api/src, ...) line up with cwd=repo root:
 *   pnpm depcruise        (runs all of the below)
 *   pnpm depcruise:pwa
 *   pnpm depcruise:web
 *   pnpm depcruise:api
 *   pnpm depcruise:packages
 *
 * Each depcruise:* script passes --ts-config as an ABSOLUTE path ("$PWD/apps/x/tsconfig.json").
 * A relative path fails with TS5083 — dependency-cruiser's tsconfig loader doesn't resolve the
 * "../../tsconfig.base.json" extends chain from a relative fileName the way `tsc` itself does.
 */

module.exports = {
  forbidden: [
    {
      name: 'no-frontend-into-api-internals',
      severity: 'error',
      comment:
        'apps/pwa and apps/web must go through apps/api/client (@neo/api-client) — direct access to apps/api/src bypasses the only trust boundary (auth, secrets, DB).',
      from: { path: '^apps/(pwa|web)/src' },
      to: { path: '^apps/api/src' },
    },
    {
      name: 'pg-only-in-db-layer',
      severity: 'error',
      comment:
        'Only apps/api/src/db/*.ts may talk to Postgres directly. Routes/commands/middleware/services must go through a db/*.ts function.',
      from: { path: '^apps/api/src/(routes|commands|middleware|services)' },
      to: { path: '^pg$' },
    },
    {
      name: 'no-packages-importing-apps',
      severity: 'error',
      comment:
        'packages/* are shared, app-agnostic building blocks. apps/api/client (@neo/api-client) is the one sanctioned exception — it IS a shared package, just physically kept next to the API it calls (see CLAUDE.md). Anything else under apps/ (app-specific pwa/web/api/telegram source) depending on it is the dependency pointing the wrong way.',
      from: { path: '^packages/' },
      to: { path: '^apps/', pathNot: '^apps/api/client' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment:
        'Module nothing imports and that imports nothing itself — likely dead code (or a false positive for a Vite entry point / route file loaded by convention, not by import).',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '\\.spec\\.ts$',
          '(^|/)main\\.ts$',
          '(^|/)vite-env\\.d\\.ts$',
          '(^|/)vitest\\.(global-)?setup\\.ts$',
          '(^|/)server\\.ts$',
          '\\.config\\.(js|cjs|mjs|ts)$',
        ],
      },
      to: {},
    },
    {
      name: 'no-circular',
      severity: 'warn',
      comment: 'Circular imports make the module graph hard to reason about and can break tree-shaking.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      // apps/**/src/**/*.js and index.js in apps/api/client/src are gitignored stale build
      // output sitting next to their .ts source (tsc -b emitting in place) — not real source.
      path: '(^|/)(node_modules|dist|coverage|\\.git)/|\\.d\\.ts$|\\.spec\\.ts$|tsconfig\\.tsbuildinfo$|apps/.*/src/.*\\.js$',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
  },
};
