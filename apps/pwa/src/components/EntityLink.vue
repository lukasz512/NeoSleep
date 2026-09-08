<template>
  <RouterLink v-if="to" :to="to" class="entity-link" @click.stop>
    {{ label }}
  </RouterLink>
  <span v-else-if="label" class="entity-link__plain">{{ label }}</span>
  <span v-else class="entity-link__empty">—</span>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

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
 */
defineProps<{
  to: RouteLocationRaw | null;
  label: string | null | undefined;
}>();
</script>

<style scoped>
.entity-link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
.entity-link:hover {
  text-decoration: underline;
}
.entity-link__plain {
  color: inherit;
}
.entity-link__empty {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
