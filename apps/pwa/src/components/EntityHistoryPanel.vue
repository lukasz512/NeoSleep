<template>
  <div class="entity-history-panel">
    <AppInlineAlert
      v-if="history?.lead_source"
      type="info"
      class="entity-history-panel__lead-source"
      :text="t('app.patients.detail.history.leadSource', { source: history.lead_source.source || t('app.patients.detail.history.unknownSource') })"
    />

    <div
      v-if="loading && !loaded"
      class="entity-history-panel__skeleton"
      role="status"
      aria-busy="true"
      data-test="history-skeleton"
    >
      <span class="d-sr-only">{{ t("app.history.loading") }}</span>
      <div v-for="n in 3" :key="n" class="entity-history-panel__skeleton-row" aria-hidden="true">
        <span class="entity-history-panel__skeleton-dot" />
        <span class="entity-history-panel__skeleton-lines">
          <span class="entity-history-panel__skeleton-line" />
          <span class="entity-history-panel__skeleton-line entity-history-panel__skeleton-line--short" />
        </span>
      </div>
    </div>
    <AppErrorState
      v-else-if="loadError"
      :error="loadFailure"
      :subtitle="t('app.history.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="loadHistory"
    />
    <AppStateView v-else-if="entries.length === 0" :title="t('app.history.empty')">
      <template #icon>
        <AppIcon name="file" />
      </template>
    </AppStateView>
    <div v-else class="entity-history-panel__timeline" data-test="history-timeline">
      <section
        v-for="group in dayGroups"
        :key="group.key"
        class="entity-history-panel__day"
        :aria-labelledby="`${uid}-day-${group.key}`"
      >
        <h3 :id="`${uid}-day-${group.key}`" class="entity-history-panel__day-label">
          {{ historyDayLabel(t, group.date, now, dateLocale) }}
        </h3>
        <ol class="entity-history-panel__list">
          <li
            v-for="entry in group.entries"
            :key="entry.id"
            class="entity-history-panel__entry"
            :class="{
              'entity-history-panel__entry--clinical': isClinicalHistoryEntry(entry),
              'entity-history-panel__entry--quiet': entry.action === 'read',
            }"
            :style="{ '--entry-index': Math.min(entryIndex(entry.id), 12) }"
            data-test="history-entry"
          >
            <span
              class="entity-history-panel__dot"
              :class="`bg-${historyActionColor(entry.action)}`"
              :data-color="historyActionColor(entry.action)"
              aria-hidden="true"
            >
              <AppIcon :name="historyActionIcon(entry.action)" class="entity-history-panel__dot-icon" />
            </span>

            <div class="entity-history-panel__card">
              <div class="entity-history-panel__head">
                <p class="entity-history-panel__headline">{{ historyHeadline(t, entry, lookups) }}</p>
                <span v-if="isClinicalHistoryEntry(entry)" class="entity-history-panel__clinical-badge">
                  <AppIcon name="nav-sleep-studies" class="entity-history-panel__badge-icon" />
                  {{ t("app.history.clinical") }}
                </span>
              </div>

              <p class="entity-history-panel__meta">
                <EntityLink
                  v-if="entry.user_name && entry.user_id"
                  :to="userDetailLink(authStore.user?.role, entry.user_id)"
                  :label="entry.user_name"
                />
                <span v-else>{{ entry.user_name ?? t("app.history.actor.system") }}</span>
                <span aria-hidden="true" class="entity-history-panel__sep">·</span>
                <time :datetime="entry.created_at" :title="fullTimestamp(entry.created_at)">
                  {{ timeOfDay(entry.created_at) }}
                </time>
              </p>

              <ul
                v-if="inlineChanges(entry).length > 0"
                class="entity-history-panel__changes"
                data-test="history-changes"
              >
                <li
                  v-for="change in inlineChanges(entry)"
                  :key="change.field"
                  class="entity-history-panel__change"
                >
                  <span class="d-sr-only">{{ changeSentence(entry, change) }}</span>
                  <span aria-hidden="true" class="entity-history-panel__change-visual">
                    <span class="entity-history-panel__change-field">{{ historyFieldLabel(t, change.field) }}</span>
                    <template v-if="entry.action === 'update'">
                      <span class="entity-history-panel__change-before">{{ valueLabel(entry, change.field, change.before) }}</span>
                      <AppIcon name="arrow-right" class="entity-history-panel__change-arrow" />
                    </template>
                    <span class="entity-history-panel__change-after">{{ valueLabel(entry, change.field, entry.action === 'delete' ? change.before : change.after) }}</span>
                  </span>
                </li>
              </ul>

              <button
                type="button"
                class="entity-history-panel__toggle"
                :aria-expanded="expanded.has(entry.id)"
                :aria-controls="`${uid}-details-${entry.id}`"
                data-test="history-toggle"
                @click="toggle(entry.id)"
              >
                {{ expanded.has(entry.id) ? t("app.history.details.hide") : t("app.history.details.show") }}
                <AppIcon name="chevron-down" class="entity-history-panel__toggle-icon" />
              </button>

              <Transition name="entity-history-details">
                <div
                  v-if="expanded.has(entry.id)"
                  :id="`${uid}-details-${entry.id}`"
                  class="entity-history-panel__details"
                  data-test="history-details"
                >
                  <dl class="entity-history-panel__facts">
                    <div>
                      <dt>{{ t("app.history.details.recordedAt") }}</dt>
                      <dd><time :datetime="entry.created_at">{{ fullTimestamp(entry.created_at) }}</time></dd>
                    </div>
                    <div>
                      <dt>{{ t("app.history.details.author") }}</dt>
                      <dd>{{ entry.user_name ?? t("app.history.actor.system") }}</dd>
                    </div>
                    <div>
                      <dt>{{ t("app.history.details.record") }}</dt>
                      <dd>
                        {{ historyEntityTypeLabel(t, entry.entity_type) }}
                        <code v-if="entry.entity_id" :title="entry.entity_id">{{ shortId(entry.entity_id) }}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>{{ t("app.history.details.auditRef") }}</dt>
                      <dd><code :title="entry.id">{{ shortId(entry.id) }}</code></dd>
                    </div>
                  </dl>

                  <table v-if="historyFieldChanges(entry).length > 0" class="entity-history-panel__diff-table">
                    <caption class="d-sr-only">{{ t("app.history.details.changesCaption") }}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{{ t("app.history.details.field") }}</th>
                        <th scope="col">{{ t("app.history.details.before") }}</th>
                        <th scope="col">{{ t("app.history.details.after") }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="change in historyFieldChanges(entry)" :key="change.field">
                        <th scope="row">{{ historyFieldLabel(t, change.field) }}</th>
                        <td>{{ valueLabel(entry, change.field, change.before) }}</td>
                        <td>{{ valueLabel(entry, change.field, change.after) }}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p v-else class="entity-history-panel__no-changes">{{ t("app.history.details.noFieldChanges") }}</p>
                </div>
              </Transition>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { ref, computed, onMounted, watch, useId } from "vue";
import { useI18n } from "vue-i18n";
import { AppStateView } from "@ui";
import { intlLocale } from "@i18n/language-options";
import AppErrorState from "./AppErrorState.vue";
import AppIcon from "./AppIcon.vue";
import EntityLink from "./EntityLink.vue";
import { apiFetch } from "../composables/useApi";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { userDetailLink } from "../utils/entityLinks";
import {
  historyActionIcon,
  historyActionColor,
  historyEntityTypeLabel,
  historyFieldChanges,
  historyFieldLabel,
  historyValueLabel,
  historyHeadline,
  historyHeadlineCoversChanges,
  isClinicalHistoryEntry,
  groupHistoryByDay,
  historyDayLabel,
  type HistoryFieldChange,
  type HistoryValueLookups,
} from "../utils/historyLabels";
import { AppInlineAlert } from "@ui";

/**
 * Generic history/audit-trail panel — entity-type-agnostic on purpose (props:
 * `endpoint`, not a patient id) so Patient/HCP/HCO detail views can all share
 * one timeline renderer instead of three near-identical copies. The
 * lead-conversion banner only ever renders for patients (the API only ever
 * returns `lead_source` on that endpoint) so it stays generic here too — no
 * per-entity-type branching needed on this side.
 *
 * Audit-grade by design: every entry states who, what and when in plain
 * language, and its details expose the exact timestamp with time zone, the
 * record and audit-entry references, and a before/after table of every field
 * the API's allowlist returns. Meaning never rides on color alone — the dot
 * icon is decorative, the headline carries the action.
 */
const props = defineProps<{ endpoint: string }>();

interface HistoryEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_before: Record<string, unknown> | null;
  entity_after: Record<string, unknown> | null;
}

interface EntityHistory {
  entries: HistoryEntry[];
  lead_source: { source: string | null; converted_at: string | null } | null;
}

const { t, locale } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const uid = useId();

const history = ref<EntityHistory | null>(null);
const loading = ref(false);
const loaded = ref(false);
const loadError = ref(false);
/** The error behind loadError (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const expanded = ref(new Set<string>());
const now = ref(new Date());

const entries = computed(() => history.value?.entries ?? []);
const dayGroups = computed(() => groupHistoryByDay(entries.value));
const entryIndexById = computed(() => new Map(entries.value.map((e, i) => [e.id, i])));
const dateLocale = computed(() => intlLocale(locale.value));

// Tenant lookups, localized and loaded app-wide by useLayoutState — the same
// lists the entity forms write `region`/`primary_specialty` from.
const lookups: HistoryValueLookups = {
  specialty: (code) => configStore.specialtyItems.find((o) => o.value === code)?.title,
  region: (code) => configStore.regionItems.find((o) => o.value === code)?.title,
};

function entryIndex(id: string): number {
  return entryIndexById.value.get(id) ?? 0;
}

function toggle(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function timeOfDay(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale.value, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// Full date, seconds and the reader's time zone — what an auditor needs to
// line an entry up against another system's log.
function fullTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale.value, { dateStyle: "full", timeStyle: "long" }).format(new Date(iso));
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function valueLabel(entry: HistoryEntry, field: string, value: unknown): string {
  return historyValueLabel(t, entry.entity_type, field, value, lookups);
}

// Changes worth showing without expanding: updates (unless the headline
// already says it) and the values a record was created with. Reads carry none.
function inlineChanges(entry: HistoryEntry): HistoryFieldChange[] {
  if (entry.action === "read" || historyHeadlineCoversChanges(entry)) return [];
  return historyFieldChanges(entry);
}

function changeSentence(entry: HistoryEntry, change: HistoryFieldChange): string {
  const field = historyFieldLabel(t, change.field);
  if (entry.action !== "update") {
    const value = valueLabel(entry, change.field, entry.action === "delete" ? change.before : change.after);
    return `${field}: ${value}`;
  }
  return t("app.history.fieldChangeA11y", {
    field,
    from: valueLabel(entry, change.field, change.before),
    to: valueLabel(entry, change.field, change.after),
  });
}

async function loadHistory() {
  loading.value = true;
  loadError.value = false;
  loadFailure.value = null;
  try {
    const res = await apiFetch(props.endpoint, { handleErrors: false });
    if (res.ok) {
      history.value = (await res.json()) as EntityHistory;
      expanded.value = new Set();
      now.value = new Date();
    } else {
      loadFailure.value = await reportFailedResponse(res, { where: "EntityHistoryPanel.loadHistory" });
      loadError.value = true;
    }
  } catch (err) {
    reportCaught(err, { where: "EntityHistoryPanel.loadHistory" });
    loadFailure.value = err;
    loadError.value = true;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

onMounted(loadHistory);
watch(() => props.endpoint, loadHistory);
</script>

<style scoped>
.entity-history-panel {
  --history-rail: 32px;
  --history-dot: 28px;
  --history-muted: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  --history-line: rgba(var(--v-theme-on-surface), 0.12);
}

.entity-history-panel__lead-source {
  margin-bottom: var(--space-4, 16px);
}

/* ── Day groups ───────────────────────────────────────────────────────── */
.entity-history-panel__day + .entity-history-panel__day {
  margin-top: var(--space-8, 32px);
}

.entity-history-panel__day-label {
  margin: 0 0 var(--space-4, 16px);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--history-muted);
}

.entity-history-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* ── Entry: dot on a continuous rail + content ────────────────────────── */
.entity-history-panel__entry {
  position: relative;
  display: grid;
  grid-template-columns: var(--history-rail) 1fr;
  column-gap: var(--space-3, 12px);
  padding-bottom: var(--space-6, 24px);
}

.entity-history-panel__entry::before {
  content: "";
  position: absolute;
  left: calc(var(--history-rail) / 2 - 1px);
  top: var(--history-dot);
  bottom: 0;
  width: 2px;
  background: var(--history-line);
}

.entity-history-panel__entry:last-child::before {
  display: none;
}

.entity-history-panel__dot {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--history-dot);
  height: var(--history-dot);
  border-radius: 50%;
  /* Ring in the surface color separates the dot from the rail behind it. */
  box-shadow: 0 0 0 3px rgb(var(--v-theme-surface));
}

.entity-history-panel__dot-icon {
  width: 15px;
  height: 15px;
}

.entity-history-panel__entry--quiet .entity-history-panel__dot {
  --history-dot: 22px;
  width: 22px;
  height: 22px;
  margin-top: 3px;
}

.entity-history-panel__entry--quiet .entity-history-panel__headline {
  font-weight: 500;
  color: var(--history-muted);
}

.entity-history-panel__card {
  min-width: 0;
  padding-top: 3px;
}

.entity-history-panel__entry--clinical .entity-history-panel__card {
  padding: 10px 12px;
  margin-top: -4px;
  border-radius: 10px;
  background: rgba(var(--v-theme-primary), 0.05);
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
}

.entity-history-panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
}

.entity-history-panel__headline {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.35;
  color: rgb(var(--v-theme-on-surface));
}

.entity-history-panel__clinical-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.1);
}

.entity-history-panel__badge-icon {
  width: 12px;
  height: 12px;
}

.entity-history-panel__meta {
  margin: var(--space-1, 4px) 0 0;
  font-size: 0.8125rem;
  color: var(--history-muted);
}

.entity-history-panel__sep {
  margin: 0 6px;
}

/* ── Inline field changes ─────────────────────────────────────────────── */
.entity-history-panel__changes {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.entity-history-panel__change-visual {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}

.entity-history-panel__change-field {
  color: var(--history-muted);
}

.entity-history-panel__change-before {
  color: var(--history-muted);
  text-decoration: line-through;
  text-decoration-color: rgba(var(--v-theme-on-surface), 0.35);
}

.entity-history-panel__change-after {
  padding: 0 6px;
  border-radius: 4px;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.entity-history-panel__change-arrow {
  width: 14px;
  height: 14px;
  color: var(--history-muted);
}

/* ── Details toggle (WCAG 2.5.8: ≥24px target, visible focus) ─────────── */
.entity-history-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  margin: var(--space-1, 4px) 0 0 calc(-1 * var(--space-2, 8px));
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: none;
  cursor: pointer;
}

.entity-history-panel__toggle:hover {
  background: rgba(var(--v-theme-primary), 0.06);
}

.entity-history-panel__toggle:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.entity-history-panel__toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.2s ease;
}

.entity-history-panel__toggle[aria-expanded="true"] .entity-history-panel__toggle-icon {
  transform: rotate(180deg);
}

/* ── Details panel ────────────────────────────────────────────────────── */
.entity-history-panel__details {
  margin-top: 6px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px solid var(--history-line);
  font-size: 0.8125rem;
}

.entity-history-panel__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px 16px;
  margin: 0;
}

.entity-history-panel__facts dt {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--history-muted);
}

.entity-history-panel__facts dd {
  margin: 1px 0 0;
  overflow-wrap: anywhere;
}

.entity-history-panel__facts code,
.entity-history-panel__details code {
  font-size: 0.75rem;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.entity-history-panel__diff-table {
  width: 100%;
  margin-top: 12px;
  border-collapse: collapse;
}

.entity-history-panel__diff-table th,
.entity-history-panel__diff-table td {
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
  border-top: 1px solid var(--history-line);
}

.entity-history-panel__diff-table thead th {
  border-top: none;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--history-muted);
}

.entity-history-panel__diff-table tbody th {
  font-weight: 500;
  color: var(--history-muted);
}

.entity-history-panel__no-changes {
  margin: 12px 0 0;
  color: var(--history-muted);
}

/* ── Skeleton ─────────────────────────────────────────────────────────── */
.entity-history-panel__skeleton-row {
  display: grid;
  grid-template-columns: var(--history-rail) 1fr;
  column-gap: var(--space-3, 12px);
  padding-bottom: var(--space-6, 24px);
}

.entity-history-panel__skeleton-dot,
.entity-history-panel__skeleton-line {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.entity-history-panel__skeleton-dot {
  justify-self: center;
  width: var(--history-dot);
  height: var(--history-dot);
  border-radius: 50%;
}

.entity-history-panel__skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.entity-history-panel__skeleton-line {
  height: 12px;
  width: 70%;
  border-radius: 6px;
}

.entity-history-panel__skeleton-line--short {
  width: 40%;
}

/* ── Motion — only when the reader hasn't asked for less ──────────────── */
@media (prefers-reduced-motion: no-preference) {
  .entity-history-panel__entry {
    animation: entity-history-enter 0.32s cubic-bezier(0.2, 0, 0, 1) both;
    animation-delay: calc(var(--entry-index, 0) * 35ms);
  }

  .entity-history-panel__skeleton-dot,
  .entity-history-panel__skeleton-line {
    animation: entity-history-pulse 1.4s ease-in-out infinite;
  }

  .entity-history-details-enter-active,
  .entity-history-details-leave-active {
    transition: opacity 0.18s ease, transform 0.18s ease;
  }

  .entity-history-details-enter-from,
  .entity-history-details-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .entity-history-panel__toggle-icon {
    transition: none;
  }
}

@keyframes entity-history-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes entity-history-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
