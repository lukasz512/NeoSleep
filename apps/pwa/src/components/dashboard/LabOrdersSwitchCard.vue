<template>
  <section class="lab-switch" data-testid="lab-orders-switch-card">
    <div class="lab-switch__head">
      <h2 class="lab-switch__title">{{ t("app.deviceOrder.labOrdersSwitch.title") }}</h2>
      <VSwitch
        :model-value="sendEnabled"
        color="primary"
        hide-details
        :loading="loading || saving"
        :disabled="loading || saving"
        :aria-label="t('app.deviceOrder.labOrdersSwitch.toggleLabel')"
        data-testid="lab-orders-switch"
        @update:model-value="onToggle"
      />
    </div>
    <AppInlineAlert v-if="loadError" type="error" :text="t('app.deviceOrder.labOrdersSwitch.loadError')" />
    <AppInlineAlert v-else-if="saveError" type="error" :text="t('app.deviceOrder.labOrdersSwitch.saveError')" />
    <p v-else class="lab-switch__hint" data-testid="lab-orders-switch-hint">
      {{ sendEnabled ? t("app.deviceOrder.labOrdersSwitch.enabledHint") : t("app.deviceOrder.labOrdersSwitch.disabledHint") }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { AppInlineAlert } from "@ui";
import { apiFetch } from "../../composables/useApi";

/**
 * NEO-210: per-tenant kill switch for everything sent to the lab (order
 * submit, "ensure lab patient", the notify-the-lab email). Admin-only card on
 * the Panel — the one admin-only screen that already exists (CLAUDE.md: no
 * separate admin app before rep-app Stage 3). The lab is never named here.
 */

interface LabOrdersConfig {
  sendEnabled: boolean;
}

const { t } = useI18n();
const sendEnabled = ref(true);
const loading = ref(false);
const saving = ref(false);
const loadError = ref(false);
const saveError = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch("/api/v1/device-orders/lab-orders-config", { handleErrors: false });
    if (res.ok) sendEnabled.value = ((await res.json()) as LabOrdersConfig).sendEnabled;
    else loadError.value = true;
  } catch {
    // benign: shown as the inline load error; the next visit retries.
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function onToggle(value: boolean | null): Promise<void> {
  const next = value === true;
  const previous = sendEnabled.value;
  sendEnabled.value = next;
  saving.value = true;
  saveError.value = false;
  try {
    const res = await apiFetch("/api/v1/device-orders/lab-orders-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sendEnabled: next }),
      handleErrors: false,
    });
    if (res.ok) sendEnabled.value = ((await res.json()) as LabOrdersConfig).sendEnabled;
    else {
      sendEnabled.value = previous;
      saveError.value = true;
    }
  } catch {
    sendEnabled.value = previous;
    saveError.value = true;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.lab-switch {
  max-width: 720px;
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
}

.lab-switch__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lab-switch__title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.lab-switch__hint {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
