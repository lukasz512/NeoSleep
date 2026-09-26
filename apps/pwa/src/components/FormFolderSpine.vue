<template>
  <div class="form-spine">
    <div class="form-spine__identity">
      <div class="form-spine__who">
        <AppAvatar
          :name="name || null"
          :first-name="firstName || null"
          :last-name="lastName || null"
          :entity-type="entityType"
          :size="48"
        />
        <p
          class="form-spine__name"
          :class="{ 'form-spine__name--pending': !name }"
          data-testid="form-spine-name"
        >
          {{ name || namePending }}
        </p>
      </div>
      <!-- NEO-118 ficha: one labelled fact per line, so nothing wraps into
           the next fact ("nac." used to end one line, the date start the next). -->
      <dl v-if="facts.length || status" class="form-spine__facts" data-testid="form-spine-facts">
        <div v-for="f in facts" :key="f.key" class="form-spine__fact" :data-fact="f.key">
          <dt>{{ f.label }}</dt>
          <dd>
            {{ f.value }}
            <VTooltip v-if="f.more?.length" location="bottom">
              <template #activator="{ props: tooltipProps }">
                <span v-bind="tooltipProps" class="form-spine__more" tabindex="0">+{{ f.more.length }}</span>
              </template>
              <span>{{ f.more.join(", ") }}</span>
            </VTooltip>
          </dd>
        </div>
        <div v-if="status" class="form-spine__fact" data-fact="status">
          <dt>{{ statusLabel }}</dt>
          <dd>
            <VChip :color="status.color" variant="tonal" size="small">{{ status.label }}</VChip>
          </dd>
        </div>
      </dl>
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
 * (avatar and name, then a ficha of labelled facts and the status) above an index of
 * the form's sections. The name fills in live as the user types, so creating
 * and editing a record read as the same view. The index follows the sheet's
 * scroll (FormRenderer passes `active`) and marks sections with unsaved
 * changes. Phones get FormSectionChips instead.
 */
import AppAvatar from "./AppAvatar.vue";
import type { IdentityFact } from "../composables/useIdentity";
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
  /** Labelled facts under the name (sex, age, born — or specialty, clinic, ...). */
  facts: IdentityFact[];
  status: { label: string; color?: string } | null;
  /** Label for the status row ("Estado"). */
  statusLabel: string;
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
  gap: 14px;
  padding-inline-start: 4px;
}

.form-spine__who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.form-spine__facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--pwa-rule);
  font-size: 0.8125rem;
  line-height: 1.35;
}

/* Each row is a real dt/dd pair; the grid lines the labels up in one column. */
.form-spine__fact {
  display: contents;
}

.form-spine__fact dt {
  align-self: center;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.form-spine__fact dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-on-surface));
}

.form-spine__more {
  margin-inline-start: 4px;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.form-spine__name {
  margin: 0;
  min-width: 0;
  font-size: 1.0625rem;
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
