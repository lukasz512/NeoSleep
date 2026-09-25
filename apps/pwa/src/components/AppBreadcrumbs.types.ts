import type { RouteLocationRaw } from "vue-router";
import type AppIcon from "./AppIcon.vue";

// Same derivation as types/formField.ts — a plain .ts file can't import a named type from a .vue SFC.
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/** One ancestor level in the record header's eyebrow trail (NEO-56). */
export interface BreadcrumbItem {
  label: string;
  to: RouteLocationRaw;
  /** Module icon — ItemDetailLayout shows it in the record tile. */
  icon?: AppIconName;
}
