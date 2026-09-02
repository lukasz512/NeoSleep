<template>
  <div class="detail-view-tabs">
    <AppSegmentedTabs
      :model-value="modelValue"
      :options="options"
      @update:model-value="(v: string) => $emit('update:modelValue', v)"
    />
    <VWindow :model-value="modelValue" class="detail-view-tabs__window">
      <VWindowItem v-for="tab in tabs" :key="tab.value" :value="tab.value">
        <slot :name="tab.value" />
      </VWindowItem>
    </VWindow>
  </div>
</template>

<script setup lang="ts">
/**
 * Shared tabbed-detail-view shell — pairs AppSegmentedTabs (pill switcher)
 * with a non-eager VWindow, so only the active tab's slot content ever
 * mounts. That's what makes "fetch on first tab switch, not on page load"
 * work in each panel component with zero extra plumbing (see PatientDetailView.vue).
 *
 * Entity-agnostic on purpose — takes a tabs config + named slots, nothing
 * patient-specific — so other detail views (HCP/HCO/Lead) can adopt the same
 * shell later without changes here.
 */
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VWindow, VWindowItem } from "vuetify/components";
import { AppSegmentedTabs } from "@ui";

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

const options = computed(() => props.tabs.map((tab) => ({ value: tab.value, label: t(tab.labelKey) })));
</script>

<style scoped>
.detail-view-tabs__window {
  margin-top: 28px;
}

/* VWindow/VWindowItem clip overflow for the slide transition — an outlined
   field's floating label animates *above* its own top border when focused,
   which got cut off by that clipping when the field sat flush against the
   window item's top edge (e.g. PatientNotesPanel's compose textarea). Inner
   padding keeps the label's travel room inside the clipped box, unlike
   margin-top above (which is outside it and doesn't help). */
.detail-view-tabs__window :deep(.v-window-item) {
  padding-top: 10px;
}
</style>
