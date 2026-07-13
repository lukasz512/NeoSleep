import { useHead } from "@unhead/vue";
import { useI18n } from "vue-i18n";
import { computed } from "vue";

const BASE_URL = "https://neosleepcare.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og/default.jpg`;

interface SeoOptions {
  titleKey: string;
  descriptionKey: string;
  ogImagePath?: string;   // relative to public/, e.g. "/og/home.jpg"
  noindex?: boolean;
}

/**
 * Sets <title>, meta description, og:title, og:description, og:image
 * for the current route. Reacts to locale changes.
 *
 * @example
 * useSeoMeta({
 *   titleKey:       "website.seo.home.title",
 *   descriptionKey: "website.seo.home.description",
 *   ogImagePath:    "/og/home.jpg",
 * })
 */
export function useSeoMeta({ titleKey, descriptionKey, ogImagePath, noindex }: SeoOptions) {
  const { t } = useI18n();

  const title       = computed(() => t(titleKey));
  const description = computed(() => t(descriptionKey));
  const ogImage     = ogImagePath ? `${BASE_URL}${ogImagePath}` : DEFAULT_OG_IMAGE;

  useHead({
    title,
    meta: [
      { name: "description",        content: description },
      { property: "og:title",       content: title },
      { property: "og:description", content: description },
      { property: "og:image",       content: ogImage },
      { property: "og:type",        content: "website" },
      { name: "twitter:card",       content: "summary_large_image" },
      { name: "twitter:title",      content: title },
      { name: "twitter:description",content: description },
      { name: "twitter:image",      content: ogImage },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
  });
}
