/**
 * User role → avatar badge (CORE-114): the corner disc on a *user* avatar
 * (app bar, account menu, Users list/detail, mentions), the same mechanism a
 * doctor's specialty badge uses on HCP avatars (NEO-57).
 *
 * Decisions (decision form user-avatar-role-badge-r1):
 * - doctor → their specialty icon (stethoscope when unknown), dark disc
 * - admin → star on a tenant-primary disc
 * - manager → shield-check, dark disc
 * - kam → hospital, msl → presentation, dark disc
 * - rep → map-pin on a light outline disc — reps are most users, so theirs
 *   is the quietest mark
 * - a user holding several roles shows one badge: admin > doctor > manager >
 *   kam > msl > rep
 *
 * The role → icon map is data, not markup: a tenant overrides it through
 * app_config.metadata.userRoleBadges (served as `user_role_badges` by
 * GET /config/app). Overrides are limited to ROLE_BADGE_ICONS so a typo in
 * the DB can never ask AppIcon for an icon it doesn't have.
 */
import type { InjectionKey, Ref } from "vue";
import type AppIcon from "../components/AppIcon.vue";
import { practitionerSpecialtyIcon } from "./hcpLabels";

/**
 * The tenant's overrides reach AppAvatar through provide/inject (main.ts
 * provides them from the config store) — AppAvatar importing the store itself
 * pulled the whole API layer into every page that shows an avatar.
 */
export const USER_ROLE_BADGE_OVERRIDES: InjectionKey<Readonly<Ref<Record<string, string>>>> =
  Symbol("userRoleBadgeOverrides");

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

export type UserRoleBadgeTone = "dark" | "primary" | "light";

export interface UserRoleBadge {
  role: string;
  icon: AppIconName;
  tone: UserRoleBadgeTone;
}

/** Highest priority first. */
export const USER_ROLE_PRIORITY = ["admin", "doctor", "manager", "kam", "msl", "rep"] as const;

const DEFAULT_BADGES: Record<string, { icon: AppIconName; tone: UserRoleBadgeTone }> = {
  admin: { icon: "star", tone: "primary" },
  manager: { icon: "shield-check", tone: "dark" },
  kam: { icon: "hco-hospital", tone: "dark" },
  msl: { icon: "nav-presentations", tone: "dark" },
  rep: { icon: "map-pin", tone: "light" },
};

/** Icons a tenant may assign to a role through app_config. */
export const ROLE_BADGE_ICONS: readonly AppIconName[] = [
  "star",
  "shield-check",
  "users-group",
  "map-pin",
  "id-card",
  "hco-hospital",
  "nav-presentations",
  "nav-hcp",
];

function isRoleBadgeIcon(value: unknown): value is AppIconName {
  return typeof value === "string" && (ROLE_BADGE_ICONS as readonly string[]).includes(value);
}

/** One role out of however many the user has, by USER_ROLE_PRIORITY. */
export function primaryUserRole(roles: string | readonly string[] | null | undefined): string | null {
  const list = typeof roles === "string" ? [roles] : roles ?? [];
  return USER_ROLE_PRIORITY.find((r) => list.includes(r)) ?? null;
}

export function userRoleBadge(
  roles: string | readonly string[] | null | undefined,
  options: { specialty?: string | null; overrides?: Record<string, unknown> | null } = {},
): UserRoleBadge | null {
  const role = primaryUserRole(roles);
  if (!role) return null;
  if (role === "doctor") {
    return { role, icon: practitionerSpecialtyIcon(options.specialty ?? undefined), tone: "dark" };
  }
  const base = DEFAULT_BADGES[role];
  if (!base) return null;
  const override = options.overrides?.[role];
  return { role, icon: isRoleBadgeIcon(override) ? override : base.icon, tone: base.tone };
}
