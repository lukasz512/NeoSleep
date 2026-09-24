<template>
  <RouterLink v-if="to && label" :to="to" class="entity-link" @click.stop>
    <AppAvatar v-bind="avatarProps" class="entity-link__avatar" />
    <slot />
    <span>{{ label }}</span>
  </RouterLink>
  <span v-else-if="label" class="entity-link__plain">
    <AppAvatar v-bind="avatarProps" class="entity-link__avatar" />
    <!-- Optional decoration between avatar and name (e.g. LeadsView's gender icon). -->
    <slot />
    <span>{{ label }}</span>
  </span>
  <span v-else class="entity-link__empty">—</span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RouteLocationRaw } from "vue-router";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";

/**
 * THE shared "avatar + display name (+ optional link)" cell — every table/list
 * cell and related-entity link that shows a person or org name renders
 * through this (NEO-13: list-row name cells in Patients/HCP/Leads/Users,
 * Tratamientos/Estudios patient + doctor columns, notes/history authors,
 * related-entity panels). `label` is the API's already-formatted display
 * name — the salutation (Dr./Dra./Prof. only) is applied server-side by
 * apps/api/src/utils/personName.ts, so this component never re-derives it.
 *
 * Originally the "secondary name field → link to that entity's own detail
 * page" component — before it, every list/panel that shows a related person/org
 * name (Médico on a patient, dentist on a treatment plan, the author of a
 * note, ...) either rendered plain text or hand-rolled its own RouterLink
 * (LeadsView.vue/LeadDetailView.vue's local hcoLink()). `to: null` covers
 * both "no id to link to yet" (deleted/unassigned record) and "the current
 * user isn't allowed to open that detail route" (e.g. a rep viewing a note
 * authored by a manager — /users/:id is admin/manager-only) — the caller
 * decides which by what it passes, this component just renders accordingly.
 *
 * Always paired with an AppAvatar. The entity type is derived from `to`'s
 * route name by default, so the related-entity links (which already pass a
 * route name) need no extra prop; `entityType` is only an override for
 * call sites with `to: null` (a list row's own name cell).
 *
 * App-wide convention: an *identity* (hcp/patient/lead/user — a person) gets
 * initials-on-a-brand-color, AppAvatar's own designed fallback; a *place*
 * (hco — a clinic/org, not a person) always gets its entity icon instead,
 * regardless of name — "Dra. Laura Cuicas" as a clinic name is not a person
 * to initial. Withholding `name` for place types is what drives that: name
 * absent -> AppAvatar's own name -> initials -> icon chain falls through to
 * the icon.
 */
const props = withDefaults(
  defineProps<{
    to: RouteLocationRaw | null;
    label: string | null | undefined;
    /**
     * Explicit override for when `to` can't say what the entity is — a list
     * row's own name cell passes `to: null` (the whole row already
     * navigates), so there's no route name to derive the type from.
     */
    entityType?: AppAvatarEntityType;
    /** Passed through to AppAvatar for exact initials on multi-word names (see its own doc). */
    firstName?: string | null;
    lastName?: string | null;
    avatarSize?: number;
  }>(),
  { entityType: undefined, firstName: null, lastName: null, avatarSize: 20 },
);

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
  if (props.entityType) return props.entityType;
  const name = props.to && typeof props.to === "object" && "name" in props.to ? props.to.name : null;
  return (typeof name === "string" && ROUTE_ENTITY_TYPES[name]) || "user";
});

const avatarProps = computed(() => {
  const isPlace = PLACE_ENTITY_TYPES.has(entityType.value);
  return {
    name: isPlace ? null : props.label,
    firstName: isPlace ? null : props.firstName,
    lastName: isPlace ? null : props.lastName,
    entityType: entityType.value,
    size: props.avatarSize,
  };
});
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
