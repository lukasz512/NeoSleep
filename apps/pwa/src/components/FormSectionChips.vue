<template>
  <nav class="form-chips" :aria-label="indexLabel" data-testid="form-section-chips">
    <button
      v-for="s in sections"
      :key="s.id"
      ref="chipEls"
      type="button"
      class="form-chips__chip"
      :class="{ 'form-chips__chip--active': s.id === active }"
      :aria-current="s.id === active ? 'location' : undefined"
      :data-section="s.id"
      @click="emit('select', s.id)"
    >
      {{ s.label }}
      <span v-if="s.changed" class="form-chips__changed" :aria-label="changedLabel" />
    </button>
  </nav>
</template>

<script setup lang="ts">
/**
 * The phone version of the form folder's section index (NEO-92): the bottom
 * sheet has no room for a spine, so the sections become a row of chips under
 * the header — the same pattern as a record's tabs on phones (NEO-61). The
 * active chip scrolls itself into view as the sheet scrolls.
 */
import { nextTick, ref, watch } from "vue";
import type { FormSpineSection } from "./FormFolderSpine.vue";

const props = defineProps<{
  sections: FormSpineSection[];
  active: string;
  indexLabel: string;
  changedLabel: string;
}>();

const emit = defineEmits<{ select: [id: string] }>();

const chipEls = ref<HTMLElement[]>([]);

watch(
  () => props.active,
  async (id) => {
    await nextTick();
    const el = chipEls.value.find((c) => c.dataset.section === id);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
);
</script>

<style scoped>
.form-chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 12px var(--pwa-dialog-pad, 24px) 4px;
}

.form-chips::-webkit-scrollbar {
  display: none;
}

.form-chips__chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: var(--pwa-row-hover);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.form-chips__chip:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.form-chips__chip--active {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.form-chips__changed {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--v-theme-warning));
}

.form-chips__chip--active .form-chips__changed {
  background: rgb(var(--v-theme-on-primary));
}

@media (prefers-reduced-motion: reduce) {
  .form-chips__chip {
    transition: none;
  }
}
</style>
