<template>
  <div class="detail-view-tabs">
    <div class="detail-view-tabs__tabs-wrap">
      <AppSegmentedTabs
        v-if="smAndUp"
        :model-value="modelValue"
        :options="options"
        fit
        underline
        @update:model-value="(v: string) => $emit('update:modelValue', v)"
      />
      <AppChipTabs
        v-else
        :model-value="modelValue"
        :options="options"
        @update:model-value="(v: string) => $emit('update:modelValue', v)"
      />
    </div>
    <div class="detail-view-tabs__window">
      <template v-for="tab in tabs" :key="tab.value">
        <Transition name="detail-view-tabs-fade">
          <div v-if="visited.has(tab.value)" v-show="tab.value === modelValue" class="detail-view-tabs__pane" role="tabpanel">
            <slot :name="tab.value" />
          </div>
        </Transition>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Shared tabbed-detail-view shell — pairs AppSegmentedTabs (underline
 * switcher from 600px, chips below) with lazily mounted panes: a tab's slot
 * content mounts the first time it is opened and then stays mounted (hidden
 * with v-show), the same contract the non-eager VWindow had before NEO-153.
 * That's what makes "fetch on first tab switch, not on page load" work in
 * each panel component with zero extra plumbing (see PatientDetailView.vue).
 *
 * Entity-agnostic on purpose — takes a tabs config + named slots, nothing
 * patient-specific — so other detail views (HCP/HCO/Lead) can adopt the same
 * shell later without changes here.
 */
import { computed, reactive, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { AppChipTabs, AppSegmentedTabs } from "@ui";

export interface DetailViewTab {
  value: string;
  labelKey: string;
}

const props = defineProps<{
  modelValue: string;
  tabs: DetailViewTab[];
}>();

defineEmits<{
  "update:modelValue": [value: string];
}>();

const { t } = useI18n();
const { smAndUp } = useDisplay();

/** Tabs opened at least once — mounted from then on, so switching back never refetches. */
const visited = reactive(new Set<string>());
watch(
  () => props.modelValue,
  (value) => visited.add(value),
  { immediate: true },
);

const options = computed(() => props.tabs.map((tab) => ({ value: tab.value, label: t(tab.labelKey) })));
</script>

<style scoped>
/* NEO-61: every label in full at every width. From 600px up the pill bar hugs
   its tabs (AppSegmentedTabs `fit`); on phones a scrolling row of chips
   (AppChipTabs) — 6–7 sections never fit a 360px row as equal slots. */

/* Tabs → content is one 32px step: 24px here plus the pane's 8px inner
   padding below. */
.detail-view-tabs__window {
  margin-top: var(--space-6, 24px);
}

.detail-view-tabs__pane {
  padding-top: var(--space-2, 8px);
}

/* NEO-153 desktop: tabs and content share one reading column, so a note or a
   details row never runs the full width of a wide screen. Phones keep the
   full width. */
@media (min-width: 960px) {
  .detail-view-tabs {
    max-width: 720px;
  }
}

/* NEO-153: the incoming pane fades in and rises 8px; the outgoing one hides
   at once (no leave transition), so both are never in the flow together. No
   overflow clipping is needed, unlike the old horizontal VWindow slide. */
.detail-view-tabs-fade-enter-active {
  transition:
    opacity 200ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 200ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
}
.detail-view-tabs-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
@media (prefers-reduced-motion: reduce) {
  .detail-view-tabs-fade-enter-active {
    transition: none;
  }
}
</style>
