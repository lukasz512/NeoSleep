<template>
  <VAvatar
    :size="size"
    class="app-avatar"
    :class="[`app-avatar--${tone}`, { 'app-avatar--photo': !!avatarUrl }]"
    :data-tint="`${tone}-${tintIndex}`"
    :style="avatarStyle"
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
    <!-- Lead channel badge (NEO-155): where the lead came from (website,
         WhatsApp, referral, ...), sitting over the dashed outline. -->
    <!-- User role badge (CORE-114): the same corner disc, carrying the
         user's role — star for an admin (tenant-primary disc), the specialty
         for a doctor, a light outline pin for a rep (the quietest, as most
         users are reps). Labelled with the role name, unlike the decorative
         badges above, since the icon alone doesn't say "Admin". -->
    <span
      v-else-if="roleBadge"
      class="app-avatar__badge"
      :class="`app-avatar__badge--${roleBadge.tone}`"
      data-testid="app-avatar-role-badge"
      :data-role="roleBadge.role"
      :role="roleLabel ? 'img' : undefined"
      :aria-label="roleLabel || undefined"
      :aria-hidden="roleLabel ? undefined : 'true'"
      :title="roleLabel || undefined"
    >
      <AppIcon :name="roleBadge.icon" class="app-avatar__badge-icon" />
    </span>
    <span v-else-if="leadBadgeIcon" class="app-avatar__badge app-avatar__badge--lead" data-testid="app-avatar-lead-badge" aria-hidden="true">
      <AppIcon :name="leadBadgeIcon" class="app-avatar__badge-icon" />
    </span>
    <!-- Patient device-order ring (NEO-155): an arc around the avatar filled
         to the order's step (pending -> delivered), only while an order is
         live; the status itself is spelled out wherever the order is shown. -->
    <span v-if="orderProgress !== null" class="app-avatar__order-ring" data-testid="app-avatar-order-ring" aria-hidden="true" />
  </VAvatar>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { userRoleBadge, USER_ROLE_BADGE_OVERRIDES } from "../utils/userRoleBadge";
import AppIcon, { type AppIconName } from "./AppIcon.vue";
import { getInitials, getInitialsFromParts } from "../utils/initials";
import { hcoTypeIcon } from "../utils/hcoLabels";
import { identityTone } from "../utils/identityTone";
import { avatarTintIndex } from "../utils/avatarHue";
import { leadSourceIcon } from "../utils/leadSource";
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
 * NEO-155 identity ("quiet + accent"): a circle tinted from its type's color
 * family (theme.scss $pwa-avatar-families) — patients in the brand teal, the
 * rest in the desk's greys: doctors cool graphite, organizations warm stone
 * (tinted by organization type), users neutral. Within a family the tint is
 * seeded from the name (utils/avatarHue.ts), so a person keeps one color
 * everywhere. Marks carry the details: a doctor's specialty badge, a lead's
 * dashed outline (no fill — not in the system yet) with its channel badge, a
 * patient's device-order ring.
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
    /** Only meaningful when entityType is "hco" — organization.type (clinic/hospital/pharmacy/practice/other), selects the type-specific icon and tint. */
    orgType?: string | null;
    size?: number | string;
    /** Only for entityType "hcp": the doctor's (first) specialty code — picks the badge icon. */
    specialty?: string | null;
    /** Only for entityType "patient": latest device purchase_order.status — draws the order ring. */
    orderStatus?: string | null;
    /** Only for entityType "lead": lead.source (utils/leadSource.ts) — picks the channel badge. */
    leadSource?: string | null;
    /** Only for entityType "user": users.role (or several roles) — picks the role badge (utils/userRoleBadge.ts). */
    role?: string | readonly string[] | null;
    /** Translated role name for the role badge's aria-label/title. */
    roleLabel?: string | null;
  }>(),
  { entityType: "user", size: 40, specialty: null, orderStatus: null, leadSource: null, role: null, roleLabel: null },
);

const tone = computed(() => identityTone(props.entityType));
// Organizations are tinted by what they are; people by who they are.
const tintIndex = computed(() => {
  if (tone.value === "org") return avatarTintIndex("org", props.orgType);
  const seed = props.name?.trim() || [props.firstName, props.lastName].filter(Boolean).join(" ");
  return avatarTintIndex(tone.value, seed);
});
const orderProgress = computed(() => (props.entityType === "patient" ? deviceOrderProgress(props.orderStatus) : null));
const avatarStyle = computed(() => {
  const tint = `--pwa-avatar-${tone.value}-${tintIndex.value}`;
  return {
    "--app-avatar-bg": `var(${tint}-bg)`,
    "--app-avatar-fg": `var(${tint}-fg)`,
    ...(orderProgress.value === null ? {} : { "--app-avatar-order-progress": String(orderProgress.value) }),
  };
});

const initials = computed(() => {
  if (props.entityType === "hco") return "";
  if (props.firstName?.trim() && props.lastName?.trim()) {
    return getInitialsFromParts(props.firstName, props.lastName);
  }
  return props.name?.trim() ? getInitials(props.name) : "";
});

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
const leadBadgeIcon = computed(() => (props.entityType === "lead" ? leadSourceIcon(props.leadSource) : null));
// The tenant's icon overrides, provided by main.ts (none in a bare mount).
const roleBadgeOverrides = inject(USER_ROLE_BADGE_OVERRIDES, null);
const roleBadge = computed(() =>
  props.entityType === "user"
    ? userRoleBadge(props.role, { specialty: props.specialty, overrides: roleBadgeOverrides?.value })
    : null,
);
const initialsFontSize = computed(() => `${Math.max(sizePx.value * FIBONACCI_INITIALS_RATIO, 8)}px`);

</script>

<style scoped>
.app-avatar {
  flex-shrink: 0;
  /* Circle (NEO-155). overflow stays visible so the badges and the lead /
     order rings can sit over the edge; the photo clips itself. */
  overflow: visible !important;
  position: relative;
  isolation: isolate;
  background: var(--app-avatar-bg);
  color: var(--app-avatar-fg);
}

.app-avatar :deep(.v-img) {
  border-radius: 50%;
}

/* Lead: outline only — a dashed teal ring and no fill — someone on the way
   in, not in the system yet. The channel badge sits above the ring. */
.app-avatar--lead {
  background: transparent;
}

.app-avatar--lead::after {
  content: "";
  position: absolute;
  inset: 0;
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
     never smaller than 12px, so the icon stays legible on a 20px mention;
     on big avatars it scales with them. Above the lead's dashed ring. */
  right: -3px;
  bottom: -3px;
  width: max(44%, 12px);
  height: max(44%, 12px);
  z-index: 2;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--pwa-avatar-doctor-badge);
  color: rgb(var(--v-theme-surface));
  /* Ring in the surface color separates the disc from the avatar under it. */
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
}

.app-avatar__badge--lead {
  background: var(--pwa-identity-lead);
}

/* Role badges (CORE-114): dark = the doctor-badge graphite; primary = the
   tenant's brand color (admin); light = surface disc with a graphite ring
   and icon (rep — the quietest mark). */
.app-avatar__badge--primary {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.app-avatar__badge--light {
  background: rgb(var(--v-theme-surface));
  color: var(--pwa-avatar-doctor-badge);
  box-shadow:
    0 0 0 2px rgb(var(--v-theme-surface)),
    inset 0 0 0 1.5px var(--pwa-avatar-doctor-badge);
}

.app-avatar__badge-icon {
  width: 72%;
  height: 72%;
  /* Thicker than the icon's own stroke so it survives at ~9px. */
  stroke-width: 2.8 !important;
}

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
