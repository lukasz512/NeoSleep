<template>
  <AppStateView :title="displayTitle" :subtitle="displaySubtitle">
    <template #icon>
      <AppIcon name="sad-cloud" />
    </template>
    <template #cta>
      <div class="app-error-state__actions">
        <AppButton
          color="primary"
          variant="outlined"
          class="app-error-state__refresh"
          :loading="loading"
          ignore-global-loading
          :aria-label="refreshLabel"
          @click="$emit('refresh')"
        >
          <template #prepend>
            <AppIcon name="refresh" class="app-error-state__btn-icon" />
          </template>
          {{ refreshLabel }}
        </AppButton>
        <AppButton
          v-if="secondaryLabel && secondaryHref"
          variant="text"
          class="app-error-state__secondary"
          :href="secondaryHref"
          :aria-label="secondaryLabel"
        >
          {{ secondaryLabel }}
        </AppButton>
      </div>
    </template>
  </AppStateView>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AppStateView, useErrorText } from "@ui";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";

const props = withDefaults(
  defineProps<{
    /** Contextual title. Optional when `error` is given — the title then comes from the error class (NEO-81). */
    title?: string;
    subtitle?: string;
    /**
     * The caught error (ApiError or anything else). When set, the title says what
     * actually went wrong (offline vs. server problem vs. not found...) instead of
     * always "Network problem", and a short support reference is appended for
     * failures on our side.
     */
    error?: unknown;
    refreshLabel: string;
    loading?: boolean;
    /** Optional secondary action (e.g. "Report incident") rendered as a plain-text link below the refresh button — a `href` (mailto:, tel:, etc.) rather than an emit, since it's meant for actions that leave the app. */
    secondaryLabel?: string;
    secondaryHref?: string;
  }>(),
  { loading: false, title: undefined, subtitle: undefined, error: undefined },
);

const describeError = useErrorText();
const errorText = computed(() => (props.error == null ? null : describeError(props.error)));
// A caller's own contextual title ("Failed to load documents") wins; otherwise the
// error class names the problem ("Can't reach the server" / "Something went wrong on our side").
const displayTitle = computed(() => props.title ?? errorText.value?.title ?? "");
const displaySubtitle = computed(() => {
  if (!errorText.value) return props.subtitle;
  return [props.subtitle, errorText.value.body, errorText.value.reference].filter(Boolean).join(" ");
});

defineEmits<{
  refresh: [];
}>();
</script>

<style scoped>
.app-error-state__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.app-error-state__refresh {
  min-height: 44px;
  min-width: 44px;
}

.app-error-state__secondary {
  min-height: 44px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.app-error-state__btn-icon {
  width: 20px;
  height: 20px;
}
</style>
