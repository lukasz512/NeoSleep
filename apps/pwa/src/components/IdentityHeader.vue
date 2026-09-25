<template>
  <span class="identity-header" data-testid="identity-header">
    <AppAvatar
      :name="name"
      :first-name="firstName"
      :last-name="lastName"
      :entity-type="entityType"
      :org-type="orgType"
      :specialty="specialty"
      :size="56"
    />
    <span class="identity-header__text">
      <span class="identity-header__title-row">
        <h1 class="identity-header__name">{{ name }}</h1>
        <!-- Status badges etc. that belong next to the name. -->
        <slot />
      </span>
      <IdentityDetails :details="details" :more="moreDetails" class="identity-header__details" />
    </span>
  </span>
</template>

<script setup lang="ts">
import AppAvatar, { type AppAvatarEntityType } from "./AppAvatar.vue";
import IdentityDetails from "./IdentityDetails.vue";

/**
 * Large identity for a detail view's title (NEO-57): the organic-square
 * avatar in the identity's tint, the name, and one quiet line under it —
 * "Female · 40 y · b. 7/2/1986" for a patient, "Dentist · Clínica Dental
 * Polanco" for a doctor, "Clinic · Ciudad de México" for an organization.
 * Same line as in the lists, just a little larger; no field labels.
 */
withDefaults(
  defineProps<{
    name: string;
    entityType: AppAvatarEntityType;
    firstName?: string | null;
    lastName?: string | null;
    orgType?: string | null;
    details?: string[];
    moreDetails?: string[];
    /** Doctor's (first) specialty code, for the avatar badge icon. */
    specialty?: string | null;
  }>(),
  { firstName: null, lastName: null, orgType: null, details: () => [], moreDetails: () => [], specialty: null },
);
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
  gap: 4px;
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

.identity-header__text .identity-header__details {
  /* 15px under the 22px name. */
  font-size: 0.9375rem;
}
</style>
