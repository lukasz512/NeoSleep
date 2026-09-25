<template>
  <VAvatar
    :size="size"
    class="app-avatar"
    :class="[`app-avatar--${tone}`, { 'app-avatar--photo': !!avatarUrl }]"
  >
    <VImg v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" cover />
    <span v-else-if="initials" class="app-avatar__initials" :style="{ fontSize: initialsFontSize }">{{ initials }}</span>
    <AppIcon v-else :name="iconName" class="app-avatar__icon" />
    <!-- Doctor badge (NEO-57): a small stethoscope disc on the bottom-right
         corner, so a doctor reads as a doctor while keeping their initials. -->
    <span v-if="showDoctorBadge" class="app-avatar__badge" data-testid="app-avatar-doctor-badge" aria-hidden="true">
      <AppIcon name="nav-hcp" class="app-avatar__badge-icon" />
    </span>
  </VAvatar>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon, { type AppIconName } from "./AppIcon.vue";
import { getInitials, getInitialsFromParts } from "../utils/initials";
import { hcoTypeIcon } from "../utils/hcoLabels";
import { identityTone } from "../utils/identityTone";

/**
 * Placeholder identity photo, shared by HCP/HCO/patient/lead/user lists,
 * detail headers, and FormRenderer's edit/add dialog. Falls back in order:
 * real photo (avatarUrl) -> initials on a brand-derived color -> a generic
 * icon for the entity type. An *identity* (hcp/patient/lead/user - a person)
 * follows that full chain; a *place* (hco - a clinic/org, not a person)
 * always gets its entity icon instead, regardless of name - "Dra. Laura
 * Cuicas" as a clinic name is not a person to initial. This is enforced here
 * so every caller gets it right for free, rather than each call site having
 * to remember to withhold `name` for place types.
 *
 * NEO-57 identity: an organic square (squircle) tinted with its type's color
 * (theme.scss --pwa-identity-*: patient teal, doctor blue, organization
 * amber, users/leads neutral), initials/icon in that same color — so a mixed
 * list reads by kind at a glance. Replaces the earlier per-name seeded
 * colors and the outlined patient circle. A real photo keeps the same shape.
 */
export type AppAvatarEntityType = "hcp" | "hco" | "patient" | "lead" | "user" | "event";

const ENTITY_ICONS: Record<AppAvatarEntityType, AppIconName> = {
  hcp: "nav-hcp",
  hco: "nav-hco",
  patient: "nav-patients",
  lead: "nav-leads",
  user: "nav-users",
  event: "nav-planner",
};

const props = withDefaults(
  defineProps<{
    name?: string | null;
    /**
     * When both are given, initials come straight from these instead of
     * being guessed out of `name` — the only way to get it right for a
     * multi-word first or last name (e.g. "Lorena Alejandra González
     * Pimentel": splitting the *display* name can't tell where the given
     * name(s) end and the surname(s) begin, but the identity record itself
     * already knows). `name` is still used for the color seed/alt text.
     */
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    entityType?: AppAvatarEntityType;
    /** Only meaningful when entityType is "hco" — organization.type (clinic/hospital/pharmacy/practice/other), selects the type-specific icon. */
    orgType?: string | null;
    size?: number | string;
  }>(),
  { entityType: "user", size: 40 },
);

const initials = computed(() => {
  if (props.entityType === "hco") return "";
  if (props.firstName?.trim() && props.lastName?.trim()) {
    return getInitialsFromParts(props.firstName, props.lastName);
  }
  return props.name?.trim() ? getInitials(props.name) : "";
});
const tone = computed(() => identityTone(props.entityType));

const iconName = computed(() =>
  props.entityType === "hco" ? hcoTypeIcon(props.orgType ?? undefined) : ENTITY_ICONS[props.entityType],
);
// Ratio of two consecutive Fibonacci numbers (21/55) converges to 1/φ² ≈
// 0.382 — small enough that two-letter initials keep breathing room inside
// the circle instead of crowding its edge.
const FIBONACCI_INITIALS_RATIO = 21 / 55;
// Scales with `size` instead of a fixed rem value — a chip-sized avatar
// (~18-24px) needs proportionally smaller text than the 40px default.
// `size` must be numeric (px) here: percentage/keyword sizes (e.g. "100%")
// resolve their real pixel size only via CSS, so callers relying on that
// must also pass the equivalent numeric size for this calculation.
const sizePx = computed(() => (typeof props.size === "number" ? props.size : parseFloat(String(props.size)) || 40));
// Every doctor avatar carries the badge, at every size — the disc has its
// own minimum size (CSS below), so it stays readable on a 20px mention.
const showDoctorBadge = computed(() => props.entityType === "hcp");
const initialsFontSize = computed(() => `${Math.max(sizePx.value * FIBONACCI_INITIALS_RATIO, 8)}px`);

</script>

<style scoped>
.app-avatar {
  flex-shrink: 0;
  /* Organic square (squircle): a superellipse mask instead of VAvatar's
     circle or a plain rounded rectangle — the corners flow into the sides
     with no visible arc joint, at every size from an 18px mention to the
     56px header, because the mask scales with the element. */
  border-radius: 0 !important;
  /* The tint and the squircle live on ::before, not on the avatar itself:
     masking the avatar would also clip the doctor badge that sits over its
     corner. A photo gets the same mask directly (below). */
  overflow: visible !important;
  position: relative;
  isolation: isolate;
  background: transparent;
  color: var(--app-avatar-fg);
}

.app-avatar::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--app-avatar-bg);
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.app-avatar :deep(.v-img) {
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M50 0C88 0 100 12 100 50S88 100 50 100 0 88 0 50 12 0 50 0Z'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.app-avatar__badge {
  position: absolute;
  /* Fixed small overhang (not a % of the avatar): enough to sit on the
     corner, never so much that a table cell or card clips it. The disc is
     never smaller than 13px, so the stethoscope stays legible on a 20px
     mention; on big avatars it scales with them. */
  right: -3px;
  bottom: -3px;
  width: max(44%, 13px);
  height: max(44%, 13px);
  z-index: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--pwa-identity-doctor);
  color: rgb(var(--v-theme-surface));
  /* Ring in the surface color separates the disc from the avatar under it. */
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
}

/* Nudge a doctor's initials up-left, away from the badge in the corner,
   so neither covers the other on small avatars. */
.app-avatar--doctor .app-avatar__initials {
  transform: translate(-10%, -10%);
}

.app-avatar__badge-icon {
  width: 72%;
  height: 72%;
  /* Thicker than the icon's own stroke so it survives at ~9px. */
  stroke-width: 2.8 !important;
}

.app-avatar--patient { --app-avatar-bg: var(--pwa-identity-patient-soft); --app-avatar-fg: var(--pwa-identity-patient); }
.app-avatar--doctor  { --app-avatar-bg: var(--pwa-identity-doctor-soft);  --app-avatar-fg: var(--pwa-identity-doctor); }
.app-avatar--org     { --app-avatar-bg: var(--pwa-identity-org-soft);     --app-avatar-fg: var(--pwa-identity-org); }
.app-avatar--person  { --app-avatar-bg: var(--pwa-identity-person-soft);  --app-avatar-fg: var(--pwa-identity-person); }

.app-avatar--photo::before {
  background: transparent;
}

.app-avatar__initials {
  color: inherit;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.app-avatar__icon {
  width: 55%;
  height: 55%;
  color: inherit;
}
</style>
