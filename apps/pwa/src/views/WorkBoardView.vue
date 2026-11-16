<template>
  <div class="view-work-board">
    <AppLoadingState v-if="loading" />
    <AppEmptyState v-else-if="teams === null" :title="t('workBoard.forbidden')" :subtitle="t('workBoard.forbiddenHint')" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <template v-else>
      <div class="work-board__toolbar" :class="{ 'work-board__toolbar--compact': compact }">
        <AppChipTabs v-model="team" :options="teamOptions" class="work-board__teams" data-testid="work-board-teams" />
        <VTextField
          ref="searchRef"
          v-model="query"
          :placeholder="t('workBoard.search')"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="work-board__search"
          data-testid="work-board-search"
        />
        <AppButton
          variant="text"
          prepend-icon="mdi-key-variant"
          class="work-board__tokens"
          :aria-label="tokensText"
          :title="tokensText"
          data-testid="work-board-tokens"
          @click="tokensOpen = true"
        >
          <span v-if="tokenCount !== null" data-testid="work-board-token-count">{{ tokenCount }}</span>
        </AppButton>
        <AppButton color="primary" variant="flat" data-testid="work-board-new" @click="creating = true">
          {{ t("workBoard.new") }}
        </AppButton>
      </div>
      <WorkBoardFilters
        v-model:sessions-only="sessionsOnly"
        v-model:sort="sort"
        v-model:dense="dense"
        :labels="labels"
        :selected="selectedLabels"
        :session-count="sessionCount"
        @toggle-label="toggleLabel"
        @edit-labels="labelsOpen = true"
      />
      <p v-if="!compact" class="work-board__hint">{{ t("workBoard.shortcuts") }}</p>

      <!-- By label: one lane per label, each with the same status columns; the lanes scroll sideways together. -->
      <div v-if="sort === 'label' && lanes.length" class="work-board__lanes" :class="{ 'work-board__lanes--compact': compact }" data-testid="work-board-lanes">
        <section v-for="lane in lanes" :key="laneId(lane)" class="work-board__lane" :data-testid="`work-lane-${lane.label ?? 'none'}`">
          <button
            type="button"
            class="work-board__lane-head"
            :aria-expanded="!isCollapsed(lane)"
            :aria-label="t(isCollapsed(lane) ? 'workBoard.lane.expand' : 'workBoard.lane.collapse', { name: laneName(lane) })"
            :data-testid="`work-lane-toggle-${lane.label ?? 'none'}`"
            @click="toggleLane(lane)"
          >
            <VIcon :icon="isCollapsed(lane) ? 'mdi-chevron-right' : 'mdi-chevron-down'" size="18" aria-hidden="true" />
            <WorkLabelChip v-if="lane.label !== null" :name="lane.label" />
            <span v-else class="work-board__lane-none">{{ t("workBoard.labels.none") }}</span>
            <span class="work-board__lane-count">{{ lane.items.length }}</span>
          </button>
          <WorkBoardColumns
            v-if="!isCollapsed(lane)"
            :items="lane.items"
            :layout="compact ? 'list' : 'columns'"
            lane
            @open="openItem"
            @move="moveBy"
            @drop="moveTo"
            @label="toggleLabel"
          />
        </section>
      </div>
      <WorkBoardColumns
        v-else
        :items="visible"
        :layout="compact ? 'list' : 'columns'"
        @open="openItem"
        @move="moveBy"
        @drop="moveTo"
        @label="toggleLabel"
      />
    </template>

    <WorkItemDialog
      :item-key="openKey"
      :creating="creating"
      :initial-item="openedItem"
      :teams="teams ?? []"
      :default-team="team === ALL ? null : team"
      :labels="labels"
      @close="closeDialog"
      @saved="onSaved"
    />
    <WorkSessionTokensDialog :open="tokensOpen" @close="tokensOpen = false" @active="(n) => (tokenCount = n)" />
    <WorkLabelsDialog :open="labelsOpen" :labels="labels" @close="labelsOpen = false" @saved="onLabelSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter, type LocationQuery } from "vue-router";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { AppChipTabs } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import WorkBoardColumns from "../components/workBoard/WorkBoardColumns.vue";
import WorkBoardFilters, { type WorkBoardSort } from "../components/workBoard/WorkBoardFilters.vue";
import WorkItemDialog from "../components/workBoard/WorkItemDialog.vue";
import WorkLabelChip from "../components/workBoard/WorkLabelChip.vue";
import WorkLabelsDialog from "../components/workBoard/WorkLabelsDialog.vue";
import WorkSessionTokensDialog from "../components/workBoard/WorkSessionTokensDialog.vue";
import { WORK_BOARD_CONTEXT } from "../components/workBoard/workBoardContext";
import { APP_STORAGE_KEYS } from "../config/storageKeys";
import {
  SESSION_LABEL,
  fetchSessionTokens,
  fetchWorkItems,
  fetchWorkLabels,
  fetchWorkTeams,
  groupByLabel,
  matchesLabels,
  matchesQuery,
  neighbourStatus,
  patchWorkItem,
  refreshWorkItems,
  shownLabels,
  type WorkLabelLane,
} from "../composables/useWorkBoard";
import type { WorkItem, WorkLabel, WorkLabelColor, WorkStatus, WorkTeam } from "../types/workBoard";

/**
 * Platform work board (CORE-177): every team's tickets (CORE + one key per client) as kanban
 * columns, a status-grouped list on phones. Platform admins only. ?item=CORE-12 opens a card.
 * Shortcuts: `/` search, `n` new item, `[` / `]` move the focused card, Esc closes the card.
 *
 * CORE-219: a filter row (Claude sessions, labels), label lanes instead of one priority-sorted
 * board, compact cards, and a refresh every minute so a session's live dot appears and fades.
 * The filters live in the URL (?team, ?labels, ?sessions, ?sort); density and folded lanes are
 * this browser's own.
 */
const ALL = "all";
const REFRESH_MS = 60_000;
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();

function queryList(value: LocationQuery[string] | undefined): string[] {
  return (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string" && v !== "");
}

interface BoardPrefs {
  dense: boolean;
  /** Folded lanes: lower-cased label names, "" for the "No label" lane. */
  collapsed: string[];
}

function readPrefs(): BoardPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(APP_STORAGE_KEYS.workBoard) ?? "{}");
    const saved = typeof raw === "object" && raw !== null ? (raw as Partial<Record<keyof BoardPrefs, unknown>>) : {};
    return {
      dense: saved.dense === true,
      collapsed: Array.isArray(saved.collapsed) ? saved.collapsed.filter((v): v is string => typeof v === "string") : [],
    };
  } catch {
    // benign: storage is blocked or holds something else; the board starts with its defaults
    return { dense: false, collapsed: [] };
  }
}

const prefs = readPrefs();
const loading = ref(true);
const loadFailure = ref<unknown>(null);
const teams = ref<WorkTeam[] | null>([]);
const items = ref<WorkItem[]>([]);
const labels = ref<WorkLabel[]>([]);
const team = ref<string>(queryList(route.query.team)[0] ?? ALL);
const query = ref<string | null>("");
const creating = ref(false);
/** Only tickets a Claude Code session created (label `session`, CORE-187). */
const sessionsOnly = ref(route.query.sessions === "1");
const selectedLabels = ref<string[]>(queryList(route.query.labels));
const sort = ref<WorkBoardSort>(route.query.sort === "label" ? "label" : "priority");
const dense = ref(prefs.dense);
const collapsed = ref<string[]>(prefs.collapsed);
const tokensOpen = ref(false);
const labelsOpen = ref(false);
/** Tokens that still work; null until the first answer (the key then shows no number). */
const tokenCount = ref<number | null>(null);
const now = ref(Date.now());
const searchRef = ref<{ focus: () => void } | null>(null);
const compact = computed(() => smAndDown.value);

const colors = computed(() => {
  const map: Record<string, WorkLabelColor> = {};
  for (const label of labels.value) map[label.name.toLowerCase()] = label.color;
  return map;
});
provide(WORK_BOARD_CONTEXT, { colors, dense, now });

const teamOptions = computed(() => [
  { value: ALL, label: t("workBoard.allTeams") },
  ...(teams.value ?? []).map((tm) => ({ value: tm.key, label: tm.key })),
]);

const inTeam = computed(() => items.value.filter((item) => team.value === ALL || item.team_key === team.value));
const sessionCount = computed(() => inTeam.value.filter((item) => item.labels.includes(SESSION_LABEL)).length);
const visible = computed(() =>
  inTeam.value.filter(
    (item) =>
      (!sessionsOnly.value || item.labels.includes(SESSION_LABEL)) &&
      matchesLabels(item, selectedLabels.value) &&
      matchesQuery(item, query.value ?? ""),
  ),
);
const lanes = computed(() => groupByLabel(visible.value));
const tokensText = computed(() =>
  tokenCount.value === null ? t("workBoard.tokens.open") : t("workBoard.tokens.count", { n: tokenCount.value }),
);

function laneId(lane: WorkLabelLane): string {
  return lane.label?.toLowerCase() ?? "";
}
function laneName(lane: WorkLabelLane): string {
  return lane.label ?? t("workBoard.labels.none");
}
function isCollapsed(lane: WorkLabelLane): boolean {
  return collapsed.value.includes(laneId(lane));
}
function toggleLane(lane: WorkLabelLane): void {
  const id = laneId(lane);
  collapsed.value = isCollapsed(lane) ? collapsed.value.filter((x) => x !== id) : [...collapsed.value, id];
}

function toggleLabel(name: string): void {
  const same = (label: string) => label.toLowerCase() === name.toLowerCase();
  selectedLabels.value = selectedLabels.value.some(same) ? selectedLabels.value.filter((l) => !same(l)) : [...selectedLabels.value, name];
}

const openKey = computed(() => {
  const value = route.query.item;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first ? first : null;
});
/** The card's row, so the dialog opens with it instead of a loader (CORE-195). */
const openedItem = computed(() => items.value.find((item) => item.key === openKey.value) ?? null);

/** The catalog and the token count dress the board; without them it still works, so a failure stays quiet here. */
async function loadLabels(): Promise<void> {
  try {
    labels.value = await fetchWorkLabels();
  } catch {
    // benign: already reported by the composable; chips fall back to the neutral colour
  }
}
async function loadTokenCount(): Promise<void> {
  try {
    tokenCount.value = (await fetchSessionTokens()).filter((token) => !token.revoked_at).length;
  } catch {
    // benign: already reported by the composable; the key shows no number
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    teams.value = await fetchWorkTeams();
    if (teams.value) {
      if (team.value !== ALL && !teams.value.some((tm) => tm.key === team.value)) team.value = ALL;
      items.value = await fetchWorkItems();
      now.value = Date.now();
      void loadLabels();
      void loadTokenCount();
    }
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

/** Moves in flight; a refresh that lands meanwhile would put the card back where it was. */
let moving = 0;
async function refresh(): Promise<void> {
  if (loading.value || loadFailure.value || !teams.value) return;
  now.value = Date.now();
  const fresh = await refreshWorkItems();
  if (fresh && !moving) items.value = fresh;
}

function openItem(key: string): void {
  void router.replace({ query: { ...route.query, item: key } });
}

function closeDialog(): void {
  creating.value = false;
  void router.replace({ query: { ...route.query, item: undefined } });
}

function upsert(item: WorkItem): void {
  const index = items.value.findIndex((i) => i.id === item.id);
  if (index >= 0) items.value.splice(index, 1, item);
  else items.value.push(item);
}

function onSaved(item: WorkItem): void {
  upsert(item);
  // A label typed in the dialog is new to the catalog: fetch the colour the API gave it.
  if (shownLabels(item).some((label) => !(label.toLowerCase() in colors.value))) void loadLabels();
  if (creating.value) {
    creating.value = false;
    openItem(item.key);
  }
}

/** A rename reaches every item on the API; the board follows without waiting for the next refresh. */
function onLabelSaved(label: WorkLabel, previousName: string): void {
  labels.value = labels.value
    .map((l) => (l.id === label.id ? label : l))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  if (label.name === previousName) return;
  const was = previousName.toLowerCase();
  const renamed = (name: string) => (name.toLowerCase() === was ? label.name : name);
  items.value = items.value.map((item) => (item.labels.some((l) => l.toLowerCase() === was) ? { ...item, labels: item.labels.map(renamed) } : item));
  selectedLabels.value = selectedLabels.value.map(renamed);
  collapsed.value = collapsed.value.map((id) => (id === was ? label.name.toLowerCase() : id));
}

async function moveTo(key: string, status: WorkStatus): Promise<void> {
  const item = items.value.find((i) => i.key === key);
  if (!item || item.status === status) return;
  const before = item.status;
  upsert({ ...item, status, status_changed_at: new Date().toISOString() });
  moving += 1;
  try {
    upsert(await patchWorkItem(key, { status }));
  } catch {
    upsert({ ...item, status: before });
  } finally {
    moving -= 1;
  }
}

function moveBy(key: string, step: -1 | 1): void {
  const item = items.value.find((i) => i.key === key);
  const next = item ? neighbourStatus(item.status, step) : null;
  if (next) void moveTo(key, next);
}

watch([team, selectedLabels, sessionsOnly, sort], () => {
  void router.replace({
    query: {
      ...route.query,
      team: team.value === ALL ? undefined : team.value,
      labels: selectedLabels.value.length ? selectedLabels.value : undefined,
      sessions: sessionsOnly.value ? "1" : undefined,
      sort: sort.value === "label" ? "label" : undefined,
    },
  });
});

watch([dense, collapsed], () => {
  try {
    const next: BoardPrefs = { dense: dense.value, collapsed: collapsed.value };
    localStorage.setItem(APP_STORAGE_KEYS.workBoard, JSON.stringify(next));
  } catch {
    // benign: storage is blocked; the choice lasts for this visit
  }
});

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
  if (openKey.value || creating.value || tokensOpen.value || labelsOpen.value) return;
  if (event.key === "/") {
    event.preventDefault();
    searchRef.value?.focus();
  } else if (event.key === "n") {
    event.preventDefault();
    creating.value = true;
  }
}

function onVisibility(): void {
  if (document.visibilityState === "visible") void refresh();
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  window.addEventListener("keydown", onKeydown);
  document.addEventListener("visibilitychange", onVisibility);
  timer = setInterval(onVisibility, REFRESH_MS);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  document.removeEventListener("visibilitychange", onVisibility);
  clearInterval(timer);
});
</script>

<style scoped>
.view-work-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.work-board__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.work-board__teams {
  flex: 1 1 auto;
  min-width: 0;
}

.work-board__search {
  flex: 0 1 240px;
  min-width: 160px;
}

.work-board__tokens {
  font-variant-numeric: tabular-nums;
}

/* Phone: chips on their own row, then search + New sharing the next one. */
.work-board__toolbar--compact .work-board__teams {
  flex-basis: 100%;
}

.work-board__toolbar--compact .work-board__search {
  flex: 1 1 140px;
  min-width: 0;
}

.work-board__hint {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-board__lanes {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 12px;
}

.work-board__lane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Eight 240px columns and their gaps, so every lane's columns line up. */
  min-width: 2004px;
}

.work-board__lanes--compact .work-board__lane {
  min-width: 0;
}

/* The lane's name stays in view while its columns scroll sideways. */
.work-board__lane-head {
  position: sticky;
  left: 0;
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 8px;
  min-height: 32px;
  padding: 0 8px 0 4px;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
}

.work-board__lane-head:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.work-board__lane-head:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.work-board__lane-none {
  font-size: 0.8125rem;
  font-weight: 600;
}

.work-board__lane-count {
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
