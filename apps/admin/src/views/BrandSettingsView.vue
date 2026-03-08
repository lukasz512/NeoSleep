<template>
  <div class="view-brand-settings">
    <h1 class="text-h4 mb-4">{{ t("admin.brandSettings.title") }}</h1>
    <p class="text-body-2 text-medium-emphasis mb-6">{{ t("admin.brandSettings.subtitle") }}</p>

    <v-card class="mb-6" max-width="560">
      <v-card-title>{{ t("admin.brandSettings.theme") }}</v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-label class="text-caption">{{ t("admin.brandSettings.primaryColor") }}</v-label>
            <div class="d-flex align-center gap mt-1">
              <input
                v-model="form.primary_color"
                type="color"
                class="brand-settings__color-input"
                aria-label="Primary color"
              />
              <v-text-field
                v-model="form.primary_color"
                density="compact"
                hide-details
                variant="outlined"
                class="flex-grow-1"
              />
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <v-label class="text-caption">{{ t("admin.brandSettings.secondaryColor") }}</v-label>
            <div class="d-flex align-center gap mt-1">
              <input
                v-model="form.secondary_color"
                type="color"
                class="brand-settings__color-input"
                aria-label="Secondary color"
              />
              <v-text-field
                v-model="form.secondary_color"
                density="compact"
                hide-details
                variant="outlined"
                class="flex-grow-1"
              />
            </div>
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="form.border_radius"
              :label="t('admin.brandSettings.borderRadius')"
              density="compact"
              variant="outlined"
              hide-details
            />
          </v-col>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-btn
          color="primary"
          :loading="saving"
          :disabled="saving"
          @click="save"
        >
          {{ t("admin.brandSettings.save") }}
        </v-btn>
        <v-alert v-if="message" type="success" density="compact" class="ml-4 mb-0" closable>
          {{ message }}
        </v-alert>
        <v-alert v-if="error" type="error" density="compact" class="ml-4 mb-0" closable>
          {{ error }}
        </v-alert>
      </v-card-actions>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const form = ref({
  primary_color: "#1976d2",
  secondary_color: "#2e7d32",
  border_radius: "8px",
});

const saving = ref(false);
const message = ref("");
const error = ref("");

const apiBase = (import.meta.env.VITE_BFF_URL as string) ?? "";

async function load() {
  try {
    const res = await fetch(`${apiBase}/api/config/app`, { credentials: "include" });
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    form.value = {
      primary_color: data.primary_color ?? form.value.primary_color,
      secondary_color: data.secondary_color ?? form.value.secondary_color,
      border_radius: data.border_radius ?? form.value.border_radius,
    };
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load config";
  }
}

async function save() {
  saving.value = true;
  message.value = "";
  error.value = "";
  try {
    const res = await fetch(`${apiBase}/api/config/app`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form.value),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? res.statusText);
    }
    message.value = t("admin.brandSettings.saved");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.brand-settings__color-input {
  width: 48px;
  height: 40px;
  padding: 2px;
  border: 1px solid rgba(0, 0, 0, 0.38);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.gap {
  gap: 0.75rem;
}
</style>
