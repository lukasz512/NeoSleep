import { useMediaQuery } from "@vueuse/core";
import type { Ref } from "vue";

/**
 * NEO-153: ItemDetailLayout's #aside panel needs room for the 720px column
 * plus itself, so it follows the breakpoint only — a large landscape tablet
 * gets it too. One query for the layout and for views that drop what the
 * panel already shows (NEO-203: the Documentos tab's QR button).
 */
export const DETAIL_ASIDE_QUERY = "(min-width: 1280px)";

/** True while a detail view with an #aside slot shows that panel. */
export function useDetailAsideShown(): Ref<boolean> {
  return useMediaQuery(DETAIL_ASIDE_QUERY);
}
