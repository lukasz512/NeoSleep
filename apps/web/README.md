# NeoSleep Website

Marketing site (Vue 3 + Vite).

## Run

```bash
pnpm dev
```

The app starts on **http://localhost:5174** (port set in `vite.config.ts`).

**Note:** from the repo root, `pnpm dev` starts the API server, the rep app, and the website concurrently. To see the **header** (nav, logo, ThemeToggle, Contact), open the **website** in your browser: **http://localhost:5174**. Other ports are other apps (e.g. the rep app doesn't have this header).

## Build

```bash
pnpm build
pnpm preview
```
