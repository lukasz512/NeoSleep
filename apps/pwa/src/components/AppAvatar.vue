<template>
  <VAvatar :size="size" :color="avatarUrl ? undefined : bgColor" class="app-avatar">
    <VImg v-if="avatarUrl" :src="avatarUrl" :alt="name || ''" cover />
    <span v-else-if="initials" class="app-avatar__initials">{{ initials }}</span>
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
</script>

<style scoped>
.app-avatar {
  flex-shrink: 0;
}

.app-avatar__initials {
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.02em;
}

.app-avatar__icon {
  width: 55%;
  height: 55%;
  color: #fff;
}
</style>
