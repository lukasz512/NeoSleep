import type { RouteLocationRaw } from "vue-router";
import type AppIcon from "./AppIcon.vue";

// Same derivation as types/formField.ts — a plain .ts file can't import a named type from a .vue SFC.
type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/** Avatar shown in front of a record crumb — the same props AppAvatar takes. */
export interface BreadcrumbAvatar {
  name?: string;
  firstName?: string;
  lastName?: string;
  entityType: "patient" | "hcp" | "hco" | "user" | "lead";
  orgType?: string;
}

/**
 * One breadcrumb level (NEO-56). A crumb is a link (`to`), an in-page action
 * (`action`, e.g. "back to the record's first tab"), or plain text. The last
 * item in a trail is always the current page.
 */
export interface BreadcrumbItem {
  label: string;
  to?: RouteLocationRaw;
  action?: () => void;
  /** Module icon (parent crumbs). */
  icon?: AppIconName;
  /** Record avatar (record crumbs). */
  avatar?: BreadcrumbAvatar;
  /**
   * Second identifier shown next to the label — e.g. a patient's date of
   * birth — so two records with the same name can't be confused.
   */
  secondary?: string;
  /** Screen-reader label for `secondary` ("Date of birth"). */
  secondaryLabel?: string;
  /** Only for an exceptional state (follow-up, invited, inactive…) — the normal state shows nothing. */
  status?: { label: string; color: string };
}
