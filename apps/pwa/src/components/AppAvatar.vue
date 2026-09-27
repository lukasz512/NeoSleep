<template>
  <VAvatar
    :size="size"
    class="app-avatar"
    :class="[
      `app-avatar--${tone}`,
      hueClass,
      { 'app-avatar--photo': !!avatarUrl, 'app-avatar--lead': entityType === 'lead' },
    ]"
    :style="orderProgress === null ? undefined : { '--app-avatar-order-progress': orderProgress }"
  >
    <VImg v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" cover />
    <span v-else-if="initials" class="app-avatar__initials" :style="{ fontSize: initialsFontSize }">{{ initials }}</span>
    <AppIcon v-else :name="iconName" class="app-avatar__icon" />
    <!-- Doctor badge (NEO-57): a small disc on the bottom-right corner with
         the doctor's specialty icon (tooth for a dentist, lungs for a
         pulmonologist, ...; stethoscope when unknown), so a doctor reads as
         a doctor — and as which kind — while keeping their initials. -->
    <span v-if="showDoctorBadge" class="app-avatar__badge" data-testid="app-avatar-doctor-badge" aria-hidden="true">
      <AppIcon :name="badgeIcon" class="app-avatar__badge-icon" />
    </span>
    <!-- Patient device-order ring (NEO-155): an arc around the avatar filled
         to the order's step (pending -> delivered), only while an order is
         live; the status itself is spelled out wherever the order is shown. -->
    <span v-if="orderProgress !== null" class="app-avatar__order-ring" data-testid="app-avatar-order-ring" aria-hidden="true" />

  </VAvatar>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon, { type AppIconName } from "./AppIcon.vue";
import { getInitials, getInitialsFromParts } from "../utils/initials";
import { hcoTypeIcon } from "../utils/hcoLabels";
import { identityTone } from "../utils/identityTone";
import { avatarHueIndex } from "../utils/avatarHue";
import { deviceOrderProgress } from "../utils/deviceOrderStage";
import { practitionerSpecialtyIcon } from "../utils/hcpLabels";

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
 * NEO-155 identity: a circle whose tint is seeded from the person's name
 * (utils/avatarHue.ts, theme.scss --pwa-avatar-<n>-*), so a list reads varied
 * and a person keeps one color everywhere. The *kind* is carried by marks,
 * not by color: a doctor gets the specialty badge, a lead a dashed ring, a
 * patient with a live device order a progress ring; users get nothing.
 * Places (hco) and events keep their type tint (--pwa-identity-*).
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
    /** Only for entityType "hcp": the doctor's (first) specialty code — picks the badge icon. */
    specialty?: string | null;
    /** Only for entityType "patient": latest device purchase_order.status — draws the order ring. */
    orderStatus?: string | null;
  }>(),
  { entityType: "user", size: 40, specialty: null, orderStatus: null },
);

// People get a name-seeded tint; places and events keep their type tint.
const SEEDED_TYPES: ReadonlySet<AppAvatarEntityType> = new Set(["hcp", "patient", "lead", "user"]);
const hueClass = computed(() => {
  if (!SEEDED_TYPES.has(props.entityType)) return null;
  const seed = props.name?.trim() || [props.firstName, props.lastName].filter(Boolean).join(" ");
  return `app-avatar--hue-${avatarHueIndex(seed)}`;
});
const orderProgress = computed(() => (props.entityType === "patient" ? deviceOrderProgress(props.orderStatus) : null));

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
const badgeIcon = computed(() => practitionerSpecialtyIcon(props.specialty ?? undefined));
const initialsFontSize = computed(() => `${Math.max(sizePx.value * FIBONACCI_INITIALS_RATIO, 8)}px`);

</script>

<style scoped>
.app-avatar {
  flex-shrink: 0;
  /* Circle (NEO-155). overflow stays visible so the doctor badge and the
     lead / order rings can sit over the edge; the photo clips itself. */
  overflow: visible !important;
  position: relative;
  isolation: isolate;
  background: var(--app-avatar-bg);
  color: var(--app-avatar-fg);
}

.app-avatar :deep(.v-img) {
  border-radius: 50%;
}

/* Lead: dashed ring (not a patient yet). Same 2px gap + 2px stroke as the
   order ring, so both marks read as one family. */
.app-avatar--lead::after {
  content: "";
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px dashed var(--pwa-identity-lead);
  pointer-events: none;
}

.app-avatar__order-ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  pointer-events: none;
  background: conic-gradient(
    var(--pwa-identity-patient) calc(var(--app-avatar-order-progress) * 1turn),
    color-mix(in srgb, var(--pwa-identity-patient) 22%, transparent) 0
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
}

.app-avatar__badge {
  position: absolute;
  /* Fixed small overhang (not a % of the avatar): enough to sit on the
     corner, never so much that a table cell or card clips it. The disc is
     never smaller than 12px, so the stethoscope stays legible on a 20px
     mention; on big avatars it scales with them. */
  right: -3px;
  bottom: -3px;
  width: max(44%, 12px);
  height: max(44%, 12px);
  z-index: 1;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--pwa-identity-doctor);
  color: rgb(var(--v-theme-surface));
  /* Ring in the surface color separates the disc from the avatar under it. */
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
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

/* Name-seeded tints (NEO-155) — declared after the type tones so a person's
   own color wins; places/events never get a hue class. */
.app-avatar--hue-0 { --app-avatar-bg: var(--pwa-avatar-0-bg); --app-avatar-fg: var(--pwa-avatar-0-fg); }
.app-avatar--hue-1 { --app-avatar-bg: var(--pwa-avatar-1-bg); --app-avatar-fg: var(--pwa-avatar-1-fg); }
.app-avatar--hue-2 { --app-avatar-bg: var(--pwa-avatar-2-bg); --app-avatar-fg: var(--pwa-avatar-2-fg); }
.app-avatar--hue-3 { --app-avatar-bg: var(--pwa-avatar-3-bg); --app-avatar-fg: var(--pwa-avatar-3-fg); }
.app-avatar--hue-4 { --app-avatar-bg: var(--pwa-avatar-4-bg); --app-avatar-fg: var(--pwa-avatar-4-fg); }
.app-avatar--hue-5 { --app-avatar-bg: var(--pwa-avatar-5-bg); --app-avatar-fg: var(--pwa-avatar-5-fg); }
.app-avatar--hue-6 { --app-avatar-bg: var(--pwa-avatar-6-bg); --app-avatar-fg: var(--pwa-avatar-6-fg); }
.app-avatar--hue-7 { --app-avatar-bg: var(--pwa-avatar-7-bg); --app-avatar-fg: var(--pwa-avatar-7-fg); }
.app-avatar--hue-8 { --app-avatar-bg: var(--pwa-avatar-8-bg); --app-avatar-fg: var(--pwa-avatar-8-fg); }
.app-avatar--hue-9 { --app-avatar-bg: var(--pwa-avatar-9-bg); --app-avatar-fg: var(--pwa-avatar-9-fg); }

.app-avatar--photo {
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
