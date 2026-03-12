# NeoSleep Website

Strona marketingowa (Vue 3 + Vite).

## Uruchomienie

```bash
pnpm dev
```

Aplikacja startuje na **http://localhost:5174** (port w `vite.config.ts`).

**Uwaga:** Z roota repozytorium `pnpm dev` uruchamia równocześnie BFF, rep-app i website. Aby zobaczyć **header** (nawigacja, logo, ThemeToggle, Contact), otwórz w przeglądarce **website**: **http://localhost:5174**. Inne porty to inne aplikacje (np. rep-app bez tego headera).

## Build

```bash
pnpm build
pnpm preview
```
