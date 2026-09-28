export type Locale = "es" | "en";

/** D1: alfredjan.com/corporativo (ES) + /corporate (EN). */
export const LOCALE_PATHS: Record<Locale, string> = { es: "/corporativo", en: "/corporate" };

export interface LocaleResolution {
  locale: Locale;
  /** Set when the visitor landed on a path without a language and should be sent to one. */
  redirectTo?: string;
}

function fromLanguages(languages: readonly string[]): Locale {
  const first = languages[0]?.toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : "en";
}

function fromQuery(search: string): Locale | null {
  const lang = new URLSearchParams(search).get("lang");
  return lang === "es" || lang === "en" ? lang : null;
}

/**
 * pathRouting=true (production): the language is the path, a bare path redirects.
 * pathRouting=false (static previews that live under someone else's path, e.g. a private
 * review link): the language comes from ?lang=, else the browser; the URL is never rewritten.
 */
export function resolveLocale(
  pathname: string,
  languages: readonly string[],
  search = "",
  pathRouting = true,
): LocaleResolution {
  if (!pathRouting) return { locale: fromQuery(search) ?? fromLanguages(languages) };
  const path = pathname.replace(/\/+$/, "") || "/";
  for (const [locale, prefix] of Object.entries(LOCALE_PATHS) as [Locale, string][]) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return { locale };
  }
  const locale = fromLanguages(languages);
  return { locale, redirectTo: `${LOCALE_PATHS[locale]}${search}` };
}

/** The same page in the other language, keeping the rest of the query (e.g. ?src=qr). */
export function switchLocalePath(target: Locale, search = "", pathRouting = true): string {
  if (!pathRouting) {
    const params = new URLSearchParams(search);
    params.set("lang", target);
    return `?${params.toString()}`;
  }
  return `${LOCALE_PATHS[target]}${search}`;
}

export const PATH_ROUTING = (import.meta.env.VITE_PATH_ROUTING as string | undefined) !== "off";
