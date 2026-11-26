<template>
  <span v-if="text || label" class="entity-meta-line">
    <span v-if="text">{{ text }}</span>
    <span v-if="text && label" aria-hidden="true">·</span>
    <EntityLink v-if="label" :to="to" :label="label" :entity-type="entityType" :first-name="firstName" :last-name="lastName" :specialty="specialty" />
  </span>
  <span v-else>—</span>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";
import EntityLink from "./EntityLink.vue";
import type { AppAvatarEntityType } from "./AppAvatar.vue";

/**
 * Mobile list card "second line": plain meta text (from utils/mobileCardMeta)
 * followed by a related entity as an EntityLink (avatar + link). A plain
 * " · "-joined string can't carry the link/avatar, which is why the related
 * entity lives here and not in the formatter string.
 */
defineProps<{
  text?: string | null;
  to: RouteLocationRaw | null;
  label: string | null | undefined;
  entityType?: AppAvatarEntityType;
  firstName?: string | null;
  lastName?: string | null;
  specialty?: string | null;
}>();
</script>

<style scoped>
.entity-meta-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
</style>
