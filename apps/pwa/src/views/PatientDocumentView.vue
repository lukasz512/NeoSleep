<template>
  <div class="patient-document">
    <AuthCard class="patient-document__card" :title="t('publicDocument.title')" :loading="phase === 'downloading'">
      <div v-if="phase === 'invalid'" class="patient-document__body" role="alert" data-testid="document-invalid">
        <p>{{ t("publicDocument.invalid") }}</p>
      </div>
      <div v-else class="patient-document__body">
        <span class="patient-document__badge" aria-hidden="true"><AppIcon name="file-pdf" /></span>
        <p>{{ t("publicDocument.body") }}</p>
        <AppButton color="primary" size="large" block class="text-none" :loading="phase === 'downloading'" data-testid="document-download" @click="download">
          <template #prepend><AppIcon name="download" /></template>
          {{ t("publicDocument.download") }}
        </AppButton>
        <p v-if="phase === 'done'" class="patient-document__note" role="status" data-testid="document-done">{{ t("publicDocument.done") }}</p>
        <p v-if="phase === 'error'" class="patient-document__note patient-document__note--error" role="alert" data-testid="document-error">{{ t("publicDocument.error") }}</p>
        <p class="patient-document__note">{{ t("publicDocument.privacy") }}</p>
      </div>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthCard } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import { apiFetch } from "../composables/useApi";

/**
 * The patient's signed Historia clínica (NEO-258), opened from the emailed
 * link. No account — the token in the #fragment is the key and never reaches
 * a server log. Nothing is fetched until the patient taps Download, so a mail
 * scanner opening the link doesn't count as the patient opening it.
 */
const route = useRoute();
const { t } = useI18n();

const token = computed(() => route.hash.replace(/^#/, ""));
const phase = ref<"ready" | "downloading" | "done" | "invalid" | "error">(token.value ? "ready" : "invalid");

async function download(): Promise<void> {
  phase.value = "downloading";
  try {
    const res = await apiFetch("/api/v1/public/document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.value }),
      handleErrors: false,
    });
    if (res.status === 410) {
      phase.value = "invalid";
      return;
    }
    if (!res.ok) {
      phase.value = "error";
      return;
    }
    const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "historia-clinica.pdf";
    const url = URL.createObjectURL(await res.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    phase.value = "done";
  } catch {
    phase.value = "error";
  }
}
</script>

<style scoped>
.patient-document {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--space-4, 16px);
}

.patient-document__card {
  width: 100%;
  max-width: 440px;
}

.patient-document__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4, 16px);
  text-align: center;
}

.patient-document__body p {
  margin: 0;
}

.patient-document__badge {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.patient-document__badge :deep(svg) {
  width: 28px;
  height: 28px;
}

.patient-document__note {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-document__note--error {
  color: rgb(var(--v-theme-error));
}
</style>
