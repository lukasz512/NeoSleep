<template>
  <div class="form-spine">
    <div class="form-spine__identity">
      <AppAvatar
        :name="name || null"
        :first-name="firstName || null"
        :last-name="lastName || null"
        :entity-type="entityType"
        :size="64"
      />
      <div class="form-spine__who">
        <p
          class="form-spine__name"
          :class="{ 'form-spine__name--pending': !name }"
          data-testid="form-spine-name"
        >
          {{ name || namePending }}
        </p>
        <IdentityDetails v-if="details.details.length" :details="details.details" :more="details.more" />
      </div>
      <VChip v-if="status" :color="status.color" variant="tonal" size="small" class="form-spine__status">
        {{ status.label }}
      </VChip>
    </div>

    <nav class="form-spine__index" :aria-label="indexLabel" data-testid="form-spine-index">
      <button
        v-for="s in sections"
        :key="s.id"
        type="button"
        class="form-spine__link"
        :class="{ 'form-spine__link--active': s.id === active }"
        :aria-current="s.id === active ? 'location' : undefined"
        :data-section="s.id"
        @click="emit('select', s.id)"
      >
        <span class="form-spine__bullet" aria-hidden="true" />
        <span class="form-spine__label">{{ s.label }}</span>
        <span v-if="s.changed" class="form-spine__changed" :title="changedLabel" :aria-label="changedLabel" />
      </button>
    </nav>
  </div>
</template>

<script setup lang="ts">
/**
 * The spine of the "Carpeta" form folder (NEO-92): the record's identity
 * (avatar, name, the record header's detail line, status) above an index of
 * the form's sections. The name fills in live as the user types, so creating
 * and editing a record read as the same view. The index follows the sheet's
 * scroll (FormRenderer passes `active`) and marks sections with unsaved
 * changes. Phones get FormSectionChips instead.
 */
import AppAvatar from "./AppAvatar.vue";
import IdentityDetails from "./IdentityDetails.vue";
import type { IdentityDetailSet } from "../composables/useIdentity";
import type { AppAvatarEntityType } from "../types/formField";

export interface FormSpineSection {
  id: string;
  label: string;
  changed: boolean;
}

defineProps<{
  entityType?: AppAvatarEntityType;
  name: string;
  firstName?: string;
  lastName?: string;
  /** Shown in place of the name until one is typed (create mode). */
  namePending: string;
  details: IdentityDetailSet;
  status: { label: string; color?: string } | null;
  sections: FormSpineSection[];
  active: string;
  indexLabel: string;
  changedLabel: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();
</script>

<style scoped>
.form-spine {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: var(--pwa-dialog-pad, 24px) 16px var(--pwa-dialog-pad, 24px) 20px;
}

.form-spine__identity {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding-inline-start: 4px;
}

.form-spine__who {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.form-spine__name {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
  text-wrap: balance;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
}

.form-spine__name--pending {
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.form-spine__index {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.form-spine__link {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.form-spine__link:hover {
  background: var(--pwa-row-hover);
}

.form-spine__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

/* The active section is a small sheet lifted out of the spine — the same
   paper as the page it points at. */
.form-spine__link--active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 0 0 1px var(--pwa-sheet-ring), 0 1px 2px rgb(16 48 45 / 0.08);
}

.form-spine__bullet {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
}

.form-spine__link--active .form-spine__bullet {
  background: rgb(var(--v-theme-primary));
  opacity: 1;
}

.form-spine__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-spine__changed {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
}

@media (prefers-reduced-motion: reduce) {
  .form-spine__link {
    transition: none;
  }
}
</style>
