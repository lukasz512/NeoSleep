<template>
  <VAvatar
    :size="size"
    :color="avatarUrl || outlined ? undefined : bgColor"
    class="app-avatar"
    :class="{ 'app-avatar--outlined': outlined }"
    :style="outlined ? { '--app-avatar-accent': bgColor, '--app-avatar-ring': ringWidth } : undefined"
  >
    <VImg v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" cover />
    <span v-else-if="initials" class="app-avatar__initials" :style="{ fontSize: initialsFontSize }">{{ initials }}</span>
    <AppIcon v-else :name="iconName" class="app-avatar__icon" />
  </VAvatar>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon, { type AppIconName } from "./AppIcon.vue";
import { getInitials, getInitialsFromParts } from "../utils/initials";
import { getAvatarColor } from "../utils/avatarColor";
import { hcoTypeIcon } from "../utils/hcoLabels";

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
 * A patient placeholder is drawn as the "negative" of everyone else's: white
 * fill, a ring in the seeded color, and initials/icon in that same color -
 * so a patient is tellable from a doctor/rep at a glance in mixed lists and
 * EntityLink chips. A real photo (avatarUrl) is never outlined.
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
// Falls back to the entity-type string as the color seed so even a nameless
// placeholder gets a stable, on-brand color instead of Vuetify's flat gray.
const bgColor = computed(() => getAvatarColor(props.name?.trim() || props.entityType));
const outlined = computed(() => props.entityType === "patient" && !props.avatarUrl);
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
const initialsFontSize = computed(() => `${Math.max(sizePx.value * FIBONACCI_INITIALS_RATIO, 8)}px`);
// Outlined ring scales with `size` so it matches the stroke of the bold
// initials inside it (~1px on a 20px chip avatar, ~2px at the 40px default)
// instead of a fixed 2px that swamps small avatars.
const RING_TO_SIZE_RATIO = 1 / 19;
const ringWidth = computed(() => `${Math.max(sizePx.value * RING_TO_SIZE_RATIO, 1).toFixed(2)}px`);
</script>

<style scoped>
.app-avatar {
  flex-shrink: 0;
}

.app-avatar__initials {
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.app-avatar__icon {
  width: 55%;
  height: 55%;
  color: #fff;
}

.app-avatar--outlined {
  background: #fff;
  /* Inset shadow instead of border so the ring doesn't grow the avatar past `size`. */
  box-shadow: inset 0 0 0 var(--app-avatar-ring) var(--app-avatar-accent);
}

.app-avatar--outlined .app-avatar__initials,
.app-avatar--outlined .app-avatar__icon {
  color: var(--app-avatar-accent);
}

/* Colored letters on white read thinner than white on color - one weight up
   keeps their stroke equal to the ring. */
.app-avatar--outlined .app-avatar__initials {
  font-weight: 700;
}
</style>
