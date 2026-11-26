import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// packages/i18n/en.json etc. — the same source of truth the frontends use (see CLAUDE.md).
// Read via fs (not a JS import) so this isn't subject to tsc's rootDir check or Node ESM JSON
// import-attribute syntax, and works identically from src/ (dev) and dist/ (prod, same depth).
const I18N_DIR = path.join(__dirname, "../../i18n");

type Locale = "en" | "pl" | "mx";
const SUPPORTED_LOCALES: readonly Locale[] = ["en", "pl", "mx"];
const DEFAULT_LOCALE: Locale = "en";

const cache = new Map<Locale, Record<string, string>>();

function loadLocale(locale: Locale): Record<string, string> {
  const cached = cache.get(locale);
  if (cached) return cached;
  const raw = fs.readFileSync(path.join(I18N_DIR, `${locale}.json`), "utf-8");
  const messages = JSON.parse(raw) as Record<string, string>;
  cache.set(locale, messages);
  return messages;
}

function normalizeLocale(locale: string | null | undefined): Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale) ? (locale as Locale) : DEFAULT_LOCALE;
}

/** Backend equivalent of vue-i18n's $t() for email copy — same key namespace, same {param} interpolation. */
export function emailT(locale: string | null | undefined, key: string, params?: Record<string, string>): string {
  const messages = loadLocale(normalizeLocale(locale));
  let text = messages[key] ?? loadLocale(DEFAULT_LOCALE)[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value);
    }
  }
  return text;
}
