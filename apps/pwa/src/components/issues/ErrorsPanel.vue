<template>
  <div class="issues-panel">
    <AppChipTabs v-model="env" :options="envOptions" class="issues-panel__filters" />
    <p v-if="viewOnly" class="issues-panel__hint" data-testid="errors-archive-hint">{{ t("issues.errors.archiveHint") }}</p>

    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :title="t('issues.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <template v-else>
      <IssueCounters v-if="!viewOnly" v-model="filter" :counts="counts" :total="groups.length" />

      <div v-if="!visible.length" data-testid="errors-empty">
        <AppEmptyState v-if="!groups.length" :title="t(`issues.errors.emptyEnv.${env}`)" :subtitle="t('issues.empty.checked', { time: checkedTime })" />
        <AppEmptyState
          v-else
          :title="t('issues.empty.filtered')"
          :subtitle="t('issues.empty.filteredHint', { total: groups.length, time: checkedTime })"
        />
      </div>

      <ul v-else class="issues-list" data-testid="errors-list">
        <li v-for="{ group, state } in visible" :key="group.id" class="issues-item" :data-testid="`error-item-${group.id}`">
          <button type="button" class="issues-row" :data-testid="`error-row-${group.id}`" @click="selectedId = group.id">
            <span class="issues-row__dot" :class="{ 'issues-row__dot--warn': group.level === 'warn' }" :title="group.level" />
            <span class="issues-row__main">
              <span class="issues-row__title issues-row__title--mono">{{ group.message }}</span>
              <span class="issues-row__meta">
                <span class="issues-row__count">{{ t("issues.errors.count", { count: group.count }) }}</span>
                <span>{{ formatRelativeTime(group.last_seen, locale) }}</span>
                <span class="issues-row__chip">{{ sourceLabel(group.source) }}</span>
                <span v-if="group.tenant_slug">{{ group.tenant_slug }}</span>
              </span>
            </span>
          </button>
          <div v-if="!viewOnly" class="issues-item__side">
            <IssueStateChip :state="state" />
            <RouterLink
              v-if="group.ticket"
              class="issues-item__ticket"
              :to="boardCard(group.ticket.key)"
              :data-testid="`error-ticket-${group.id}`"
            >
              {{ group.ticket.key }}
            </RouterLink>
            <a
              v-if="group.ticket?.artifact_url"
              class="issues-action issues-action--primary"
              :href="group.ticket.artifact_url"
              target="_blank"
              rel="noopener"
              :data-testid="`error-artifact-${group.id}`"
            >
              {{ t("issues.ticket.openArtifact") }}
            </a>
            <a
              v-if="group.ticket?.pr_url"
              class="issues-action"
              :href="group.ticket.pr_url"
              target="_blank"
              rel="noopener"
              :data-testid="`error-changes-${group.id}`"
            >
              {{ t("issues.ticket.openChanges") }}
            </a>
          </div>
          <p v-if="state === 'needs_you' && group.ticket?.blocked_reason" class="issues-item__blocked">
            {{ group.ticket.blocked_reason }}
          </p>
        </li>
      </ul>
    </template>

    <AppFormDialog
      :model-value="selected !== null"
      :title="t('issues.detail.errorTitle')"
      max-width="720"
      @update:model-value="(v: boolean) => !v && (selectedId = null)"
      @close="selectedId = null"
    >
      <div v-if="shown" class="issues-detail" data-testid="error-detail">
        <p class="issues-detail__text issues-detail__mono">{{ shown.message }}</p>

        <dl class="issues-detail__facts">
          <template v-if="!viewOnly">
            <dt>{{ t("issues.ticket.state") }}</dt>
            <dd><IssueStateChip :state="errorState(shown)" /></dd>
          </template>
          <template v-if="shown.ticket && !viewOnly">
            <dt>{{ t("issues.ticket.label") }}</dt>
            <dd>
              <RouterLink class="issues-item__ticket" :to="boardCard(shown.ticket.key)">{{ shown.ticket.key }}</RouterLink>
            </dd>
            <template v-if="shown.ticket.branch">
              <dt>{{ t("issues.ticket.branch") }}</dt>
              <dd class="issues-detail__mono">{{ shown.ticket.branch }}</dd>
            </template>
            <template v-if="shown.ticket.blocked_reason">
              <dt>{{ t("issues.ticket.blocked") }}</dt>
              <dd>{{ shown.ticket.blocked_reason }}</dd>
            </template>
          </template>
          <dt>{{ t("issues.errors.seen") }}</dt>
          <dd>{{ t("issues.errors.count", { count: shown.count }) }}</dd>
          <dt>{{ t("issues.errors.firstSeen") }}</dt>
          <dd>{{ formatRelativeTime(shown.first_seen, locale) }}</dd>
          <dt>{{ t("issues.errors.lastSeen") }}</dt>
          <dd>{{ formatRelativeTime(shown.last_seen, locale) }}</dd>
          <dt>{{ t("issues.errors.sourceLabel") }}</dt>
          <dd>{{ sourceLabel(shown.source) }}</dd>
          <template v-if="shown.tenant_slug">
            <dt>{{ t("issues.detail.tenant") }}</dt>
            <dd>{{ shown.tenant_slug }}</dd>
          </template>
          <template v-if="shown.request_id">
            <dt>{{ t("issues.errors.requestId") }}</dt>
            <dd class="issues-detail__mono">{{ shown.request_id }}</dd>
          </template>
        </dl>

        <div v-if="!viewOnly && (shown.ticket?.artifact_url || shown.ticket?.pr_url)" class="issues-detail__links">
          <a v-if="shown.ticket.artifact_url" class="issues-action issues-action--primary" :href="shown.ticket.artifact_url" target="_blank" rel="noopener">
            {{ t("issues.ticket.openArtifact") }}
          </a>
          <a v-if="shown.ticket.pr_url" class="issues-action" :href="shown.ticket.pr_url" target="_blank" rel="noopener">
            {{ t("issues.ticket.openChanges") }}
          </a>
        </div>

        <div class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.stack") }}</span>
          <pre v-if="shown.stack" class="issues-detail__pre" data-testid="error-stack">{{ shown.stack }}</pre>
          <p v-else class="issues-detail__text">{{ t("issues.errors.noStack") }}</p>
        </div>

        <div v-if="metadataText" class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.metadata") }}</span>
          <pre class="issues-detail__pre">{{ metadataText }}</pre>
        </div>

        <div v-if="shown.linked_reports.length" class="issues-detail__section">
          <span class="issues-detail__label">{{ t("issues.errors.linkedReports") }}</span>
          <div class="issues-detail__links">
            <AppButton
              v-for="link in shown.linked_reports"
              :key="link.id"
              variant="tonal"
              size="small"
              :data-testid="`error-linked-report-${link.number}`"
              @click="emit('open-report', link.id)"
            >
              #{{ link.number }}
            </AppButton>
          </div>
        </div>
      </div>
      <template #actions>
        <VSpacer />
        <!-- The archive is view only: its rows have no ticket and never get a fix. -->
        <template v-if="shown && !viewOnly">
          <template v-if="shown.status === 'open'">
            <AppButton variant="text" :loading="saving" data-testid="error-dismiss" @click="setStatus('dismissed')">
              {{ t("issues.errors.dismiss") }}
            </AppButton>
            <AppButton color="primary" variant="flat" :loading="saving" data-testid="error-resolve" @click="setStatus('resolved')">
              {{ t("issues.errors.resolve") }}
            </AppButton>
          </template>
          <AppButton v-else color="primary" variant="flat" :loading="saving" data-testid="error-reopen" @click="setStatus('open')">
            {{ t("issues.errors.reopen") }}
          </AppButton>
        </template>
      </template>
    </AppFormDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { AppChipTabs } from "@ui";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppEmptyState from "../AppEmptyState.vue";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import IssueCounters from "./IssueCounters.vue";
import IssueStateChip from "./IssueStateChip.vue";
import { fetchDiagnostics, patchDiagnostic, useIssuesPolling } from "../../composables/useIssues";
import { showErrorToast } from "../../composables/useErrorToast";
import { formatClockTime, formatRelativeTime } from "../../utils/relativeTime";
import { countIssues, errorState, matchesIssueFilter, statedError, type IssueFilter } from "../../utils/issueState";
import type { DiagnosticEnv, DiagnosticGroup, DiagnosticStatus } from "../../types/issues";

const ENVS: DiagnosticEnv[] = ["prod", "dev", "archive"];

const emit = defineEmits<{ "open-report": [id: string] }>();

const { t, locale } = useI18n();

const env = ref<DiagnosticEnv>("prod");
const filter = ref<IssueFilter>("active");
const groups = ref<DiagnosticGroup[]>([]);
const loading = ref(true);
const loadFailure = ref<unknown>(null);
const checkedAt = ref(new Date());
const selectedId = ref<string | null>(null);
const saving = ref(false);
/** Last selected group — keeps the dialog content while it animates closed. */
const shown = ref<DiagnosticGroup | null>(null);

const envOptions = computed(() => ENVS.map((value) => ({ value, label: t(`issues.env.${value}`) })));
const viewOnly = computed(() => env.value === "archive");
const stated = computed(() => groups.value.map((group) => ({ group, issue: statedError(group), state: errorState(group) })));
const counts = computed(() => countIssues(stated.value.map((row) => row.issue)));
const visible = computed(() => (viewOnly.value ? stated.value : stated.value.filter((row) => matchesIssueFilter(row.issue, filter.value))));
const checkedTime = computed(() => formatClockTime(checkedAt.value, locale.value));

const selected = computed(() => groups.value.find((g) => g.id === selectedId.value) ?? null);
watch(selected, (group) => {
  if (group) shown.value = group;
});
const metadataText = computed(() => {
  const meta = shown.value?.metadata;
  return meta && Object.keys(meta).length ? JSON.stringify(meta, null, 2) : "";
});

/** Only the newest request may write: an env switch must not be overwritten by a slower poll. */
let requestSeq = 0;

async function load(): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  loadFailure.value = null;
  try {
    const items = await fetchDiagnostics("all", env.value);
    if (seq !== requestSeq) return;
    groups.value = items;
    checkedAt.value = new Date();
  } catch (err) {
    if (seq === requestSeq) loadFailure.value = err;
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

/** The once-a-minute refresh: no spinner, and a failed one keeps what is on screen. */
async function refresh(): Promise<void> {
  if (loading.value || loadFailure.value || saving.value) return;
  const seq = ++requestSeq;
  try {
    const items = await fetchDiagnostics("all", env.value);
    if (seq !== requestSeq) return;
    groups.value = items;
    checkedAt.value = new Date();
  } catch {
    // benign: already reported by the request; the next tick tries again.
  }
}

onMounted(load);
watch(env, () => {
  filter.value = "active";
  void load();
});
useIssuesPolling(refresh);

function sourceLabel(source: string): string {
  return source === "api" || source === "frontend" ? t(`issues.errors.source.${source}`) : source;
}

function boardCard(key: string) {
  return { name: "work-board", query: { item: key } };
}

async function setStatus(status: DiagnosticStatus): Promise<void> {
  const current = shown.value;
  if (!current || saving.value) return;
  saving.value = true;
  try {
    const updated = await patchDiagnostic(current.id, status);
    // The PATCH answers the bare row; the ticket only comes with the list.
    const merged: DiagnosticGroup = { ...current, ...updated, status, ticket: current.ticket };
    shown.value = merged;
    groups.value = groups.value.map((g) => (g.id === merged.id ? merged : g));
    selectedId.value = null;
  } catch (err) {
    showErrorToast(err);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped src="./issues.css"></style>
