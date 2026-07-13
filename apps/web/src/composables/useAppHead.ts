import { computed } from "vue";
import { useHead } from "@unhead/vue";
import { useRoute } from "vue-router";

const BASE_URL = "https://neosleepcare.com";

const HREFLANG_CODES = ["en", "pl", "es-MX", "x-default"] as const;

/** Sets global head tags: icons, PWA meta, title template, canonical, hreflang. */
export function useAppHead() {
  const route = useRoute();
  const canonical = computed(() => `${BASE_URL}${route.path}`);

  useHead({
    titleTemplate: (title) => title ? `${title} – NeoSleep` : "NeoSleep – Better Sleep. Better Life.",
    link: [
      { rel: "icon",             type: "image/svg+xml", href: "/brand/logos/icon/icon_dark.svg" },
      { rel: "apple-touch-icon",                        href: "/brand/logos/icon/icon_dark.svg" },
      { rel: "canonical",                               href: canonical },
      ...HREFLANG_CODES.map((hreflang) => ({ rel: "alternate", hreflang, href: canonical })),
    ],
    meta: [
      { name: "theme-color",                          content: "#128F83" },
      { name: "mobile-web-app-capable",               content: "yes" },
      { name: "apple-mobile-web-app-capable",          content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title",            content: "NeoSleep" },
    ],
  });
}
