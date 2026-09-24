<template>
  <VDialog :model-value="modelValue" max-width="760" scrollable @update:model-value="(v) => emit('update:modelValue', v)">
    <VCard>
      <VCardTitle class="oa-txn-log__title-row">
        <span>{{ t("app.orthoApneaOrder.transactionLog.title") }}</span>
        <VSpacer />
        <AppButton icon variant="text" :aria-label="t('app.common.close')" @click="emit('update:modelValue', false)">
          <AppIcon name="close" />
        </AppButton>
      </VCardTitle>

      <VCardText>
        <AppLoadingState v-if="loading && !loaded" />
        <AppErrorState
          v-else-if="loadError"
          :title="t('app.errorState.title')"
          :subtitle="t('app.orthoApneaOrder.transactionLog.errorLoad')"
          :refresh-label="t('app.errorState.refresh')"
          :loading="loading"
          @refresh="load"
        />
        <template v-else-if="history">
          <div class="oa-txn-log__summary">
            <VChip :color="linkStatusColor(history.link?.sync_status)" size="small" variant="tonal">
              {{ history.link ? t(`app.orthoApneaOrder.transactionLog.linkStatus.${history.link.sync_status}`) : t("app.orthoApneaOrder.transactionLog.notLinked") }}
            </VChip>
            <span v-if="history.link?.external_id" class="oa-txn-log__meta">
              {{ t("app.orthoApneaOrder.transactionLog.externalId") }}: <strong>{{ history.link.external_id }}</strong>
            </span>
            <span v-if="history.link?.external_status" class="oa-txn-log__meta">
              {{ t("app.orthoApneaOrder.transactionLog.externalStatus") }}: <strong>{{ history.link.external_status }}</strong>
            </span>
          </div>

          <AppEmptyState v-if="history.transactions.length === 0" :title="t('app.orthoApneaOrder.transactionLog.empty')" />
          <VExpansionPanels v-else variant="accordion" class="oa-txn-log__panels">
            <VExpansionPanel v-for="txn in history.transactions" :key="txn.id">
              <VExpansionPanelTitle>
                <div class="oa-txn-log__row">
                  <VChip :color="txn.success ? 'success' : 'error'" size="small" variant="tonal">
                    {{ txn.success ? t("app.orthoApneaOrder.transactionLog.callSucceeded") : t("app.orthoApneaOrder.transactionLog.callFailed") }}
                  </VChip>
                  <span class="oa-txn-log__action">{{ txn.action }}</span>
                  <span v-if="txn.http_status != null" class="oa-txn-log__http">HTTP {{ txn.http_status }}</span>
                  <VIcon v-if="missingFields(txn).length > 0" icon="mdi-alert" color="warning" size="18" class="oa-txn-log__warning-icon" />
                  <VSpacer />
                  <span class="oa-txn-log__timestamp">{{ new Date(txn.created_at).toLocaleString() }}</span>
                </div>
              </VExpansionPanelTitle>
              <VExpansionPanelText>
                <VAlert v-if="missingFields(txn).length > 0" type="warning" variant="tonal" density="comfortable" class="mb-3">
                  {{ t("app.orthoApneaOrder.transactionLog.missingFieldsWarning", { fields: missingFields(txn).join(", ") }) }}
                </VAlert>
                <p v-if="txn.error_message" class="oa-txn-log__error">
                  {{ t("app.orthoApneaOrder.transactionLog.errorMessage") }}: {{ txn.error_message }}
                </p>

                <p class="oa-txn-log__label">{{ t("app.orthoApneaOrder.transactionLog.requestPayload") }}</p>
                <pre class="oa-txn-log__json">{{ formatJson(txn.request_payload) }}</pre>

                <p class="oa-txn-log__label">{{ t("app.orthoApneaOrder.transactionLog.responsePayload") }}</p>
                <pre class="oa-txn-log__json">{{ formatJson(txn.response_payload) }}</pre>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </template>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import { apiFetch } from "../../composables/useApi";

/**
 * Admin-only debugging view over `partner_link`/`partner_transaction`
 * (migration 018, see ADR-017) for one treatment_plan's OrthoApnea order —
 * every request/response JSON pair ever exchanged, so an admin can both
 * debug a failed order and verify "the JSON we think we sent" matches "the
 * JSON actually sent" (they're the same object by construction — see
 * services/partners/orthoapnea.ts and its tests — this view makes that
 * verifiable by eye, not just by code review).
 *
 * Gated by the caller (PatientOrthoApneaPanel.vue checks isAdmin before even
 * rendering the button that opens this) AND by the backend route itself
 * (`requireRole("admin")` on GET .../treatments/:id/transactions) — this
 * component has no gating logic of its own, it just renders whatever the
 * (already-authorized) response contains.
 *
 * Internal/debugging view by design: payloads render as raw, monospaced
 * `<pre>` JSON rather than a prettified field-by-field UI — readability for
 * a developer/admin comparing against a captured request, not end-user
 * polish.
 */

interface PartnerLinkSummary {
  external_id: string | null;
  external_status: string | null;
  sync_status: "pending" | "synced" | "failed";
}

interface PartnerTransactionRow {
  id: string;
  action: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  http_status: number | null;
  success: boolean;
  validation_report: { missingFields?: string[] } | null;
  error_message: string | null;
  created_at: string;
}

interface PartnerTransactionHistory {
  link: PartnerLinkSummary | null;
  transactions: PartnerTransactionRow[];
}

const props = defineProps<{
  modelValue: boolean;
  treatmentPlanId: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();

const history = ref<PartnerTransactionHistory | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch(`/api/v1/partners/orthoapnea/treatments/${props.treatmentPlanId}/transactions`, {
      handleErrors: false,
    });
    if (res.ok) {
      history.value = (await res.json()) as PartnerTransactionHistory;
    } else {
      loadError.value = true;
    }
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

function missingFields(txn: PartnerTransactionRow): string[] {
  return txn.validation_report?.missingFields ?? [];
}

function linkStatusColor(status: PartnerLinkSummary["sync_status"] | undefined): string {
  switch (status) {
    case "synced": return "success";
    case "failed": return "error";
    case "pending": return "warning";
    default: return "default";
  }
}

function formatJson(value: unknown): string {
  if (value == null) return t("app.orthoApneaOrder.transactionLog.noPayload");
  return JSON.stringify(value, null, 2);
}

// immediate: true — the parent mounts this component via v-if at the same
// moment it sets modelValue to true (see PatientOrthoApneaPanel's
// openTransactionLog()), so there is no false→true transition for a
// non-immediate watcher to ever observe; without this the dialog opens
// permanently stuck on nothing (no loading state, no content).
watch(
  () => props.modelValue,
  (open) => {
    if (open) load();
  },
  { immediate: true }
);
</script>

<style scoped>
.oa-txn-log__title-row {
  display: flex;
  align-items: center;
  margin: 8px 8px 0;
}

.oa-txn-log__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.oa-txn-log__meta {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.oa-txn-log__panels {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
}

.oa-txn-log__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding-right: 8px;
}

.oa-txn-log__action {
  font-weight: 600;
  font-size: 0.875rem;
}

.oa-txn-log__http {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.oa-txn-log__timestamp {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.oa-txn-log__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin: 12px 0 4px;
}

.oa-txn-log__error {
  font-size: 0.875rem;
  color: rgb(var(--v-theme-error));
}

.oa-txn-log__json {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0 0 8px;
  max-height: 320px;
  overflow-y: auto;
}
</style>
