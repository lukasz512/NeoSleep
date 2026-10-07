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
        <AppButton
          :variant="sessionsOnly ? 'tonal' : 'outlined'"
          :color="sessionsOnly ? 'primary' : undefined"
          :prepend-icon="sessionsOnly ? 'mdi-check' : 'mdi-robot-outline'"
          :aria-pressed="sessionsOnly"
          data-testid="work-board-session-filter"
          @click="sessionsOnly = !sessionsOnly"
        >
          {{ t("workBoard.sessionFilter") }}
        </AppButton>
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
        <AppButton variant="text" prepend-icon="mdi-key-outline" data-testid="work-board-tokens" @click="tokensOpen = true">
          {{ t("workBoard.tokens.open") }}
        </AppButton>
        <AppButton color="primary" variant="flat" data-testid="work-board-new" @click="creating = true">
          {{ t("workBoard.new") }}
        </AppButton>
      </div>
      <p v-if="!compact" class="work-board__hint">{{ t("workBoard.shortcuts") }}</p>

      <!-- Phone: one list grouped by status (same data as the columns). -->
      <div v-if="compact" class="work-board__list" data-testid="work-board-list">
        <section v-for="status in WORK_BOARD_COLUMNS" :key="status" class="work-board__group">
          <h2 class="work-board__heading">
            {{ t(`workBoard.status.${status}`) }} <span class="work-board__count">{{ grouped[status].length }}</span>
          </h2>
          <WorkItemCard v-for="item in shown(status)" :key="item.id" :item="item" :draggable="false" @open="openItem" @move="moveBy" />
          <button v-if="hiddenCount(status)" type="button" class="work-board__more" @click="showAllDone = true">
            {{ t("workBoard.showMore", { count: hiddenCount(status) }) }}
          </button>
        </section>
      </div>

      <!-- Desktop: kanban columns; drag a card or focus it and press [ / ]. -->
      <div v-else class="work-board__columns" data-testid="work-board-columns">
        <section
          v-for="status in WORK_BOARD_COLUMNS"
          :key="status"
          class="work-board__column"
          :class="{ 'work-board__column--over': dropTarget === status }"
          :data-testid="`work-column-${status}`"
          @dragover.prevent="dropTarget = status"
          @dragleave="dropTarget = dropTarget === status ? null : dropTarget"
          @drop.prevent="onDrop($event, status)"
        >
          <h2 class="work-board__heading">
            {{ t(`workBoard.status.${status}`) }} <span class="work-board__count">{{ grouped[status].length }}</span>
          </h2>
          <div class="work-board__cards">
            <WorkItemCard v-for="item in shown(status)" :key="item.id" :item="item" @open="openItem" @move="moveBy" />
            <button v-if="hiddenCount(status)" type="button" class="work-board__more" data-testid="work-board-more" @click="showAllDone = true">
              {{ t("workBoard.showMore", { count: hiddenCount(status) }) }}
            </button>
          </div>
        </section>
      </div>
    </template>

    <WorkItemDialog
      :item-key="openKey"
      :creating="creating"
      :teams="teams ?? []"
      :default-team="team === ALL ? null : team"
      @close="closeDialog"
      @saved="onSaved"
    />
    <WorkSessionTokensDialog :open="tokensOpen" @close="tokensOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { AppChipTabs } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import WorkItemCard from "../components/workBoard/WorkItemCard.vue";
import WorkItemDialog from "../components/workBoard/WorkItemDialog.vue";
import WorkSessionTokensDialog from "../components/workBoard/WorkSessionTokensDialog.vue";
import {
  SESSION_LABEL,
  WORK_BOARD_COLUMNS,
  fetchWorkItems,
  fetchWorkTeams,
  groupByStatus,
  matchesQuery,
  neighbourStatus,
  patchWorkItem,
} from "../composables/useWorkBoard";
import type { WorkItem, WorkStatus, WorkTeam } from "../types/workBoard";

/**
 * Platform work board (CORE-177): every team's tickets (CORE + one key per client) as kanban
 * columns, a status-grouped list on phones. Platform admins only. ?item=CORE-12 opens a card.
 * Shortcuts: `/` search, `n` new item, `[` / `]` move the focused card, Esc closes the card.
 */
const ALL = "all";
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const { smAndDown } = useDisplay();

const loading = ref(true);
const loadFailure = ref<unknown>(null);
const teams = ref<WorkTeam[] | null>([]);
const items = ref<WorkItem[]>([]);
const team = ref<string>(ALL);
const query = ref<string | null>("");
const creating = ref(false);
/** Only tickets a Claude Code session created (label `session`, CORE-187). */
const sessionsOnly = ref(false);
const tokensOpen = ref(false);
const dropTarget = ref<WorkStatus | null>(null);
const searchRef = ref<{ focus: () => void } | null>(null);
const compact = computed(() => smAndDown.value);

const teamOptions = computed(() => [
  { value: ALL, label: t("workBoard.allTeams") },
  ...(teams.value ?? []).map((tm) => ({ value: tm.key, label: tm.key })),
]);

const visible = computed(() =>
  items.value.filter(
    (item) =>
      (team.value === ALL || item.team_key === team.value) &&
      (!sessionsOnly.value || item.labels.includes(SESSION_LABEL)) &&
      matchesQuery(item, query.value ?? ""),
  ),
);
const grouped = computed(() => groupByStatus(visible.value));

/** Done keeps growing (all of Linear's history lands there), so it shows the newest few until asked. */
const DONE_PREVIEW = 20;
const showAllDone = ref(false);
function shown(status: WorkStatus): WorkItem[] {
  const list = grouped.value[status];
  return status === "done" && !showAllDone.value ? list.slice(0, DONE_PREVIEW) : list;
}
function hiddenCount(status: WorkStatus): number {
  return grouped.value[status].length - shown(status).length;
}

const openKey = computed(() => {
  const value = route.query.item;
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first ? first : null;
});

async function load(): Promise<void> {
  loading.value = true;
  loadFailure.value = null;
  try {
    teams.value = await fetchWorkTeams();
    if (teams.value) items.value = await fetchWorkItems();
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
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
  if (creating.value) {
    creating.value = false;
    openItem(item.key);
  }
}

async function moveTo(key: string, status: WorkStatus): Promise<void> {
  const item = items.value.find((i) => i.key === key);
  if (!item || item.status === status) return;
  const before = item.status;
  upsert({ ...item, status, status_changed_at: new Date().toISOString() });
  try {
    upsert(await patchWorkItem(key, { status }));
  } catch {
    upsert({ ...item, status: before });
  }
}

function moveBy(key: string, step: -1 | 1): void {
  const item = items.value.find((i) => i.key === key);
  const next = item ? neighbourStatus(item.status, step) : null;
  if (next) void moveTo(key, next);
}

function onDrop(event: DragEvent, status: WorkStatus): void {
  dropTarget.value = null;
  const key = event.dataTransfer?.getData("text/plain");
  if (key) void moveTo(key, status);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
  if (openKey.value || creating.value || tokensOpen.value) return;
  if (event.key === "/") {
    event.preventDefault();
    searchRef.value?.focus();
  } else if (event.key === "n") {
    event.preventDefault();
    creating.value = true;
  }
}

onMounted(() => {
  void load();
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
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

.work-board__columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 1fr);
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 12px;
}

.work-board__column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 240px;
  padding: 8px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px dashed transparent;
  border-radius: 12px;
}

.work-board__column--over {
  border-color: rgb(var(--v-theme-primary));
}

.work-board__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.work-board__heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 4px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.work-board__count {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-board__more {
  padding: 8px;
  font: inherit;
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  background: none;
  border: 0;
  cursor: pointer;
}

.work-board__list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.work-board__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
