import type AppIcon from "../components/AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/**
 * Single source of truth for the icon + color of every entity action that
 * repeats across the app (list-item context menus AND detail-view header
 * buttons, for leads/hcp/hco/patients/users) — change an icon or a color
 * here once instead of hunting through every view.
 *
 * Consumed two ways:
 *  - List-item menus (AppListItemMenu content): entityActionMenuIconClass()
 *  - Detail-view header-action buttons (ItemDetailLayout's #header-actions):
 *    entityActionBtnClass()
 * Both rely on the same shared CSS (see .pwa-action-icon in theme.scss and
 * .view-item__action-btn in ItemDetailLayout.vue) so a tone always looks
 * identical in both places.
 */
export type EntityActionTone = "success" | "primary" | "error" | "neutral";

export interface EntityActionDef {
  readonly icon: AppIconName;
  readonly tone: EntityActionTone;
}

export const ENTITY_ACTIONS = {
  scheduleVisit:  { icon: "calendar",   tone: "success" },
  moveToContacts: { icon: "user-arrow", tone: "primary" },
  edit:           { icon: "pencil",     tone: "primary" },
  resetPassword:  { icon: "key",        tone: "neutral" },
  toggleStatus:   { icon: "power",      tone: "neutral" },
  delete:         { icon: "trash",      tone: "error" },
} satisfies Record<string, EntityActionDef>;

export type EntityActionKey = keyof typeof ENTITY_ACTIONS;

export function entityActionIcon(key: EntityActionKey): AppIconName {
  return ENTITY_ACTIONS[key].icon;
}

export function entityActionTone(key: EntityActionKey): EntityActionTone {
  return ENTITY_ACTIONS[key].tone;
}

/** Class for the bare AppIcon inside a list-item context menu (AppListItemMenu). */
export function entityActionMenuIconClass(key: EntityActionKey): string {
  const tone = ENTITY_ACTIONS[key].tone;
  return tone === "neutral" ? "pwa-action-icon" : `pwa-action-icon pwa-action-icon--${tone}`;
}

/** Class for the header-action AppButton in ItemDetailLayout's #header-actions slot. */
export function entityActionBtnClass(key: EntityActionKey): string {
  return `view-item__action-btn view-item__action-btn--${ENTITY_ACTIONS[key].tone}`;
}
