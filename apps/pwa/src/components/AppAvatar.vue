<template>
  <VAvatar :size="size" :color="avatarUrl ? undefined : bgColor" class="app-avatar">
    <VImg v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" cover />
    <span v-else-if="initials" class="app-avatar__initials" :style="{ fontSize: initialsFontSize }">{{ initials }}</span>
    <AppIcon v-else :name="iconName" class="app-avatar__icon" />
  </VAvatar>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon, { type AppIconName } from "./AppIcon.vue";
import { getInitials } from "../utils/initials";
import { getAvatarColor } from "../utils/avatarColor";

/**
 * Placeholder identity photo, shared by HCP/HCO/patient/lead/user lists,
 * detail headers, and FormRenderer's edit/add dialog. Falls back in order:
 * real photo (avatarUrl) -> initials on a brand-derived color -> a generic
 * icon for the entity type (used when there's no name yet, e.g. a fresh
 * "add" form).
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
    avatarUrl?: string | null;
    entityType?: AppAvatarEntityType;
    size?: number | string;
  }>(),
  { entityType: "user", size: 40 },
);

const initials = computed(() => (props.name?.trim() ? getInitials(props.name) : ""));
// Falls back to the entity-type string as the color seed so even a nameless
// placeholder gets a stable, on-brand color instead of Vuetify's flat gray.
const bgColor = computed(() => getAvatarColor(props.name?.trim() || props.entityType));
const iconName = computed(() => ENTITY_ICONS[props.entityType]);
// Ratio of two consecutive Fibonacci numbers (21/55) converges to 1/φ² ≈
// 0.382 — small enough that two-letter initials keep breathing room inside
// the circle instead of crowding its edge.
const FIBONACCI_INITIALS_RATIO = 21 / 55;
// Scales with `size` instead of a fixed rem value — a chip-sized avatar
// (~18-24px) needs proportionally smaller text than the 40px default.
// `size` must be numeric (px) here: percentage/keyword sizes (e.g. "100%")
// resolve their real pixel size only via CSS, so callers relying on that
// must also pass the equivalent numeric size for this calculation.
const initialsFontSize = computed(() => {
  const sizeNum = typeof props.size === "number" ? props.size : parseFloat(String(props.size)) || 40;
  return `${Math.max(sizeNum * FIBONACCI_INITIALS_RATIO, 8)}px`;
});
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
</style>
