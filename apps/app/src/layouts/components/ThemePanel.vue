<template>
  <VDialog
    :model-value="modelValue"
    max-width="680"
    content-class="theme-panel-dialog__content"
    class="theme-panel-dialog"
    :aria-label="t('rep.themePanel.title')"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <VCard class="theme-panel-dialog__card">
      <VCardTitle class="d-flex align-center justify-space-between mx-2 mt-2 text-h6">
        {{ t("rep.themePanel.title") }}
        <VBtn
          icon
          variant="text"
          size="small"
          :aria-label="t('rep.themePanel.close')"
          @click="emit('update:modelValue', false)"
        >
          <VIcon icon="mdi-close" />
        </VBtn>
      </VCardTitle>
      <VCardText class="pt-0">
        <!-- Color scheme first -->
        <div class="theme-panel-section">
          <h3 class="theme-panel-section__label">{{ t("rep.themePanel.colorScheme") }}</h3>
          <div class="theme-panel-toggle-group" role="group" aria-label="Color scheme">
            <button
              type="button"
              class="theme-panel-toggle-btn"
              :class="{ 'theme-panel-toggle-btn--active': safeLocal.color_scheme === 'light' }"
              :aria-pressed="safeLocal.color_scheme === 'light'"
              @click="local.color_scheme = 'light'"
            >
              {{ t("rep.themePanel.light") }}
            </button>
            <button
              type="button"
              class="theme-panel-toggle-btn"
              :class="{ 'theme-panel-toggle-btn--active': safeLocal.color_scheme === 'dark' }"
              :aria-pressed="safeLocal.color_scheme === 'dark'"
              @click="local.color_scheme = 'dark'"
            >
              {{ t("rep.themePanel.dark") }}
            </button>
          </div>
        </div>

        <!-- Primary and Secondary for the selected scheme only -->
        <template v-if="safeLocal.color_scheme === 'light'">
          <div class="theme-panel-section">
            <h3 class="theme-panel-section__label">{{ t("rep.themePanel.primaryColor") }}</h3>
            <div class="theme-panel-swatches">
              <button
                v-for="color in primaryPalette"
                :key="'pl-' + color"
                type="button"
                class="theme-panel-swatch"
                :class="{ 'theme-panel-swatch--selected': safeLocal.primary_color === color }"
                :style="{ backgroundColor: color }"
                :aria-label="color"
                :aria-pressed="safeLocal.primary_color === color"
                @click="local.primary_color = color"
              />
            </div>
          </div>
          <div class="theme-panel-section">
            <h3 class="theme-panel-section__label">{{ t("rep.themePanel.secondaryColor") }}</h3>
            <div class="theme-panel-swatches">
              <button
                v-for="color in secondaryPalette"
                :key="'sl-' + color"
                type="button"
                class="theme-panel-swatch"
                :class="{ 'theme-panel-swatch--selected': safeLocal.secondary_color === color }"
                :style="{ backgroundColor: color }"
                :aria-label="color"
                :aria-pressed="safeLocal.secondary_color === color"
                @click="local.secondary_color = color"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <div class="theme-panel-section">
            <h3 class="theme-panel-section__label">{{ t("rep.themePanel.primaryColor") }}</h3>
            <div class="theme-panel-swatches">
              <button
                v-for="color in primaryPalette"
                :key="'pd-' + color"
                type="button"
                class="theme-panel-swatch"
                :class="{ 'theme-panel-swatch--selected': safeLocal.primary_color_dark === color }"
                :style="{ backgroundColor: color }"
                :aria-label="color"
                :aria-pressed="safeLocal.primary_color_dark === color"
                @click="local.primary_color_dark = color"
              />
            </div>
          </div>
          <div class="theme-panel-section">
            <h3 class="theme-panel-section__label">{{ t("rep.themePanel.secondaryColor") }}</h3>
            <div class="theme-panel-swatches">
              <button
                v-for="color in secondaryPalette"
                :key="'sd-' + color"
                type="button"
                class="theme-panel-swatch"
                :class="{ 'theme-panel-swatch--selected': safeLocal.secondary_color_dark === color }"
                :style="{ backgroundColor: color }"
                :aria-label="color"
                :aria-pressed="safeLocal.secondary_color_dark === color"
                @click="local.secondary_color_dark = color"
              />
            </div>
          </div>
        </template>
      </VCardText>

      <VCardActions class="px-4 pb-4 pt-0">
        <VBtn color="primary" :loading="saving" :disabled="saving" @click="save">
          {{ t("rep.themePanel.save") }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "../../composables/useNotifications";
import type { AppConfig } from "../../composables/useAppConfig";

const { t } = useI18n();
const notifications = useNotifications();

const DEFAULT_CONFIG: AppConfig = {
  primary_color: "#128F83",
  secondary_color: "#8ED6CE",
  primary_color_dark: "#17b5a5",
  secondary_color_dark: "#17b5a5",
  border_radius: "8px",
  logo_url: null,
  surface_color: "#fafafa",
  hero_container_style: "compact",
  color_scheme: "light",
};

function toLowerHex(s: string | undefined | null): string {
  if (typeof s !== "string" || !s.trim()) return "";
  const t = s.trim();
  return t.startsWith("#") ? t.toLowerCase() : t;
}

function normalizeConfig(c: AppConfig | undefined | null): AppConfig {
  if (!c || typeof c !== "object") return { ...DEFAULT_CONFIG };
  return {
    primary_color: toLowerHex(c.primary_color) || DEFAULT_CONFIG.primary_color,
    secondary_color: toLowerHex(c.secondary_color) || DEFAULT_CONFIG.secondary_color,
    primary_color_dark: toLowerHex(c.primary_color_dark) || DEFAULT_CONFIG.primary_color_dark,
    secondary_color_dark: toLowerHex(c.secondary_color_dark) || DEFAULT_CONFIG.secondary_color_dark,
    border_radius: c.border_radius ?? DEFAULT_CONFIG.border_radius,
    logo_url: c.logo_url ?? null,
    surface_color: toLowerHex(c.surface_color) || DEFAULT_CONFIG.surface_color,
    hero_container_style: c.hero_container_style === "wide" ? "wide" : "compact",
    color_scheme: c.color_scheme === "dark" ? "dark" : "light",
  };
}

const props = defineProps<{
  modelValue: boolean;
  config?: AppConfig | null;
  /** Called when user clicks Save. Return updated config on success (so panel can sync selection), or null/false on failure. */
  saveHandler?: (config: AppConfig) => Promise<AppConfig | null | boolean>;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  save: [config: AppConfig];
}>();

const primaryPalette = [
  "#2e7d32",
  "#388e3c",
  "#43a047",
  "#66bb6a",
  "#81c784",
  "#ff9800",
  "#ffb74d",
  "#128F83",
  "#5c6bc0",
  "#ab47bc",
  "#ec407a",
  "#e53935",
];

const secondaryPalette = [
  "#1b5e20",
  "#2e7d32",
  "#388e3c",
  "#66bb6a",
  "#81c784",
  "#f57c00",
  "#ffa726",
  "#10544E",
  "#3949ab",
  "#7b1fa2",
  "#c2185b",
  "#c62828",
];

const local = ref<AppConfig>(normalizeConfig(props.config));
const saving = ref(false);

/** Always an object so template never reads from undefined. */
const safeLocal = computed(() => local.value ?? DEFAULT_CONFIG);

watch(
  () => props.config,
  (c) => {
    local.value = normalizeConfig(c);
  },
  { deep: true }
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) local.value = normalizeConfig(props.config);
  }
);

async function save() {
  saving.value = true;
  const payload = normalizeConfig(local.value);
  emit("save", payload);
  const handler = props.saveHandler;
  const result = handler ? await handler(payload) : null;
  saving.value = false;
  if (result) {
    if (typeof result === "object" && result !== null && "primary_color" in result) {
      local.value = normalizeConfig(result as AppConfig);
    }
    notifications.show(t("rep.themePanel.saved"), "success");
  }
}
</script>

<style lang="scss" scoped>
.theme-panel-dialog__card {
  border-radius: var(--rep-modal-radius, 16px);
}

.theme-panel-section {
  margin-bottom: 20px;
}

.theme-panel-section:last-of-type {
  margin-bottom: 0;
}

.theme-panel-section__label {
  margin: 0 0 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--rep-text, #212121);
}

.theme-panel-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.theme-panel-swatch {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.15s, transform 0.15s;
}

.theme-panel-swatch:hover {
  transform: scale(1.08);
}

.theme-panel-swatch--selected {
  border-color: var(--rep-text, #212121);
  box-shadow: 0 0 0 1px var(--rep-text, #212121);
}

.theme-panel-toggle-group {
  display: inline-flex;
  border-radius: 999px;
  background: var(--rep-bg-secondary, #f5f5f5);
  padding: 4px;
  gap: 0;
}

.theme-panel-toggle-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--rep-text-secondary, #666);
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.theme-panel-toggle-btn--active {
  background: var(--rep-bg, #fff);
  color: var(--rep-text, #212121);
  box-shadow: var(--rep-shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.06));
}
</style>
