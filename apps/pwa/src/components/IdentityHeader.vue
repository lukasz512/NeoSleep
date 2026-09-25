<template>
  <span class="identity-header" data-testid="identity-header">
    <AppAvatar
      :name="name"
      :first-name="firstName"
      :last-name="lastName"
      :entity-type="entityType"
      :org-type="orgType"
      :size="56"
    />
    <span class="identity-header__text">
      <span class="identity-header__title-row">
        <h1 class="identity-header__name">{{ name }}</h1>
        <!-- Status badges etc. that belong next to the name. -->
        <slot />
      </span>
      <dl v-if="visibleFields.length" class="identity-header__fields">
        <div v-for="field in visibleFields" :key="field.label" class="identity-header__field">
          <dt>{{ field.label }}</dt>
          <dd>
            {{ field.value }}
            <IdentityTags v-if="field.more?.length" :tags="[]" :more="field.more" :tone="tone" class="identity-header__more" />
          </dd>
        </div>
      </dl>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";
import { identityTone } from "../utils/identityTone";
import IdentityTags from "./IdentityTags.vue";
import type { IdentityField } from "../composables/useIdentity";

/**
 * Large identity for a detail view's title (NEO-57): the "medical record"
 * header — rounded-square avatar in the identity's tint, the name, and under
 * it quiet labelled fields the way an EHR patient banner shows them
 * (SEX · AGE · DATE OF BIRTH for a patient, SPECIALTY · CLINIC for a doctor,
 * TYPE · CITY for an organization). Fields without a value are left out.
 */
const props = withDefaults(
  defineProps<{
    name: string;
    entityType: AppAvatarEntityType;
    firstName?: string | null;
    lastName?: string | null;
    orgType?: string | null;
    fields?: IdentityField[];
  }>(),
  { firstName: null, lastName: null, orgType: null, fields: () => [] },
);

const tone = computed(() => identityTone(props.entityType));
const visibleFields = computed(() => props.fields.filter((f) => f.value));
</script>

<style scoped>
.identity-header {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  /* Same space under the title as ItemDetailLayout's plain .view-item__title. */
  margin-bottom: 20px;
}

.identity-header__text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.identity-header__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  min-width: 0;
}

.identity-header__name {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.identity-header__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  margin: 0;
}

.identity-header__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.identity-header__field dt {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.59375rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.identity-header__field dd {
  margin: 0;
  font-size: 0.84375rem;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
