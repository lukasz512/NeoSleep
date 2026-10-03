<template>
  <div class="addon-card" :class="{ 'addon-card--on': modelValue }" data-testid="addon-card" @click="toggle">
    <button type="button" class="addon-card__photo" data-testid="addon-photo" :aria-label="t('app.deviceOrder.addon.enlarge')" @click.stop="lightbox = true">
      <img :src="image" :alt="title" />
      <span class="addon-card__zoom"><AppIcon name="search" /></span>
    </button>
    <div class="addon-card__body">
      <span class="addon-card__title">{{ title }}</span>
      <span class="addon-card__description">{{ description }}</span>
      <Transition name="addon-card__chip">
        <span v-if="modelValue" class="addon-card__chip" data-testid="addon-added">
          <AppIcon name="check" class="addon-card__chip-icon" />{{ t("app.deviceOrder.addon.added") }}
        </span>
      </Transition>
    </div>
    <!-- The switch is the real control (focus, keyboard, screen readers); the card is a bigger hit area around it. -->
    <VSwitch
      :model-value="modelValue"
      color="primary"
      inset
      hide-details
      density="compact"
      class="addon-card__switch"
      data-testid="addon-switch"
      :aria-label="title"
      @click.stop
      @update:model-value="(v) => emit('update:modelValue', !!v)"
    />

    <!-- Teleported to <body>, so its clicks never reach the card's toggle. -->
    <AppFormDialog v-model="lightbox" :title="title" :max-width="560" @close="lightbox = false">
      <div data-testid="addon-lightbox">
        <img :src="image" :alt="title" class="addon-card__lightbox-img" @click="lightbox = false" />
        <p class="text-body-2 mt-4 mb-0">{{ details }}</p>
      </div>
    </AppFormDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppIcon from "../AppIcon.vue";

/**
 * An add-on to a device order (Morning Aligner, NEO-225): photo, short text
 * and a switch. Tapping the photo opens it large with the full description
 * (Esc, X or a tap on the photo closes it); tapping anywhere else toggles.
 */
const props = defineProps<{
  modelValue: boolean;
  title: string;
  /** One line on the card. */
  description: string;
  /** Full text, shown under the large photo. */
  details: string;
  image: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();

const { t } = useI18n();
const lightbox = ref(false);

function toggle() {
  emit("update:modelValue", !props.modelValue);
}
</script>

<style scoped>
.addon-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--pwa-radius);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.addon-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.5);
}

.addon-card--on {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.addon-card__photo {
  position: relative;
  flex: none;
  width: 112px;
  height: 76px;
  padding: 0;
  border: none;
  border-radius: 8px;
  overflow: hidden;
  cursor: zoom-in;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.addon-card__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.addon-card__zoom {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(var(--v-theme-surface), 0.9);
  color: rgb(var(--v-theme-primary));
}

.addon-card__zoom :deep(svg) {
  width: 14px;
  height: 14px;
}

.addon-card__body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.addon-card__title {
  font-size: 1rem;
  font-weight: 500;
}

.addon-card__description {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.addon-card__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.addon-card__chip-icon {
  width: 12px;
  height: 12px;
}

.addon-card__chip-enter-active,
.addon-card__chip-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.addon-card__chip-enter-from,
.addon-card__chip-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.addon-card__switch {
  flex: none;
}

.addon-card__lightbox-img {
  display: block;
  width: 100%;
  border-radius: 8px;
  cursor: zoom-out;
}

@media (max-width: 599px) {
  .addon-card {
    gap: 12px;
  }

  .addon-card__photo {
    width: 84px;
    height: 56px;
  }
}
</style>
