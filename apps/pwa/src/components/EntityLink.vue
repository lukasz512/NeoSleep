<template>
  <RouterLink v-if="to && label" :to="to" class="entity-link" @click.stop>
    <AppAvatar :name="avatarName" :entity-type="entityType" :size="20" class="entity-link__avatar" />
    <span>{{ label }}</span>
  </RouterLink>
  <span v-else-if="label" class="entity-link__plain">
    <AppAvatar :name="avatarName" :entity-type="entityType" :size="20" class="entity-link__avatar" />
    <span>{{ label }}</span>
  </span>
  <span v-else class="entity-link__empty">—</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";

/**
 * Shared "secondary name field → link to that entity's own detail page"
 * component — before this, every list/panel that shows a related person/org
 * name (Médico on a patient, dentist on a treatment plan, the author of a
 * note, ...) either rendered plain text or hand-rolled its own RouterLink
 * (LeadsView.vue/LeadDetailView.vue's local hcoLink()). `to: null` covers
 * both "no id to link to yet" (deleted/unassigned record) and "the current
 * user isn't allowed to open that detail route" (e.g. a rep viewing a note
 * authored by a manager — /users/:id is admin/manager-only) — the caller
 * decides which by what it passes, this component just renders accordingly.
 *
 * Always paired with a small AppAvatar. Deriving the entity type from `to`'s
 * route name — instead of adding an `entityType` prop — is what keeps every
 * one of this component's ~8 call sites unchanged: they already pass a route
 * name in `to`, so the avatar shows up everywhere for free instead of
 * needing a second prop threaded through every query/DTO/call site touching
 * this component.
 *
 * App-wide convention: an *identity* (hcp/patient/lead/user — a person) gets
 * initials-on-a-brand-color, AppAvatar's own designed fallback; a *place*
 * (hco — a clinic/org, not a person) always gets its entity icon instead,
 * regardless of name — "Dra. Laura Cuicas" as a clinic name is not a person
 * to initial. Withholding `name` for place types is what drives that: name
 * absent -> AppAvatar's own name -> initials -> icon chain falls through to
 * the icon.
 */
const props = defineProps<{
  to: RouteLocationRaw | null;
  label: string | null | undefined;
}>();

const ROUTE_ENTITY_TYPES: Record<string, AppAvatarEntityType> = {
  "hcp-detail": "hcp",
  "hco-detail": "hco",
  "patient-detail": "patient",
  "lead-detail": "lead",
  "user-detail": "user",
};

/** Entity types that are places, not people — see the app-wide convention above. */
const PLACE_ENTITY_TYPES = new Set<AppAvatarEntityType>(["hco"]);

const entityType = computed<AppAvatarEntityType>(() => {
  const name = props.to && typeof props.to === "object" && "name" in props.to ? props.to.name : null;
  return (typeof name === "string" && ROUTE_ENTITY_TYPES[name]) || "user";
});

const avatarName = computed(() => (PLACE_ENTITY_TYPES.has(entityType.value) ? null : props.label));
</script>

<style scoped>
.entity-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.entity-link:hover {
  text-decoration: underline;
}
.entity-link__plain {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
}
.entity-link__avatar {
  flex-shrink: 0;
}
.entity-link__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
