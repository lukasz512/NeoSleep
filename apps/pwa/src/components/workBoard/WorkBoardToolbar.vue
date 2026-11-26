<template>
  <div class="work-toolbar" :class="{ 'work-toolbar--compact': compact }" data-testid="work-board-toolbar">
    <div class="work-toolbar__row">
      <AppChipTabs v-if="!compact" v-model="team" :options="teamOptions" class="work-toolbar__teams" data-testid="work-board-teams" />
      <VTextField
        ref="searchRef"
        v-model="query"
        :placeholder="t('workBoard.search')"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        class="work-toolbar__search"
        data-testid="work-board-search"
      />
      <WorkLabelChip
        :name="t('workBoard.sessionFilter')"
        color="primary"
        clickable
        :active="sessionsOnly"
        class="work-toolbar__sessions"
        data-testid="work-board-session-filter"
        @click="sessionsOnly = !sessionsOnly"
      >
        <template #icon><VIcon icon="mdi-robot-outline" size="16" aria-hidden="true" /></template>
        <span class="work-toolbar__count" data-testid="work-board-session-count">{{ sessionCount }}</span>
      </WorkLabelChip>

      <!-- Phone: one button for everything else; it opens the sheet below. -->
      <AppButton
        v-if="compact"
        variant="outlined"
        class="work-toolbar__sheet-open"
        :aria-label="filtersText"
        data-testid="work-board-filters-open"
        @click="sheetOpen = true"
      >
        <VIcon icon="mdi-tune-variant" size="20" aria-hidden="true" />
        <span v-if="phoneCount" class="work-toolbar__badge" data-testid="work-board-filters-count">{{ phoneCount }}</span>
      </AppButton>
      <template v-else>
        <VMenu :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: activator }">
            <AppButton v-bind="activator" variant="outlined" prepend-icon="mdi-filter-variant" data-testid="work-board-filters-open">
              {{ filtersText }}
            </AppButton>
          </template>
          <VSheet class="work-toolbar__menu" rounded="lg" elevation="4" data-testid="work-board-filters-menu">
            <span class="work-toolbar__caption">{{ t("workBoard.filters.labels") }}</span>
            <WorkBoardLabelFilter :labels="labels" :selected="selected" @toggle="(name) => emit('toggle-label', name)" />
          </VSheet>
        </VMenu>
        <VMenu v-model="viewOpen" :close-on-content-click="false" location="bottom end">
          <template #activator="{ props: activator }">
            <AppButton v-bind="activator" variant="outlined" prepend-icon="mdi-eye-outline" data-testid="work-board-view">
              {{ viewCount ? t("workBoard.view.count", { count: viewCount }) : t("workBoard.view.title") }}
            </AppButton>
          </template>
          <VSheet class="work-toolbar__menu" rounded="lg" elevation="4" data-testid="work-board-view-menu">
            <WorkBoardViewOptions
              v-model:out-of-step-only="outOfStepOnly"
              v-model:show-canceled="showCanceled"
              v-model:dense="dense"
              v-model:sort="sort"
              :out-of-step-count="outOfStepCount"
              :canceled-count="canceledCount"
              :token-count="tokenCount"
              :tokens-text="tokensText"
              :has-labels="labels.length > 0"
              @edit-labels="leaveFor('edit-labels')"
              @tokens="leaveFor('tokens')"
            />
          </VSheet>
        </VMenu>
        <AppButton color="primary" variant="flat" data-testid="work-board-new" @click="emit('create')">
          {{ t("workBoard.new") }}
        </AppButton>
      </template>
    </div>

    <!-- Only the labels that filter the board right now; a click takes one off. -->
    <div v-if="selected.length" class="work-toolbar__active" data-testid="work-board-active-filters">
      <WorkLabelChip
        v-for="name in selected"
        :key="name"
        :name="name"
        clickable
        active
        :aria-label="t('workBoard.filters.remove', { name })"
        :data-testid="`work-filter-label-${name}`"
        @click="emit('toggle-label', name)"
      >
        <VIcon icon="mdi-close" size="14" aria-hidden="true" />
      </WorkLabelChip>
      <AppButton variant="text" size="small" data-testid="work-board-clear-filters" @click="emit('clear-labels')">
        {{ t("workBoard.filters.clear") }}
      </AppButton>
    </div>

    <template v-if="compact">
      <VBottomSheet v-model="sheetOpen" :z-index="OVER_BOTTOM_NAV">
        <VSheet class="work-toolbar__sheet" data-testid="work-board-sheet">
          <h2 class="work-toolbar__sheet-title">{{ t("workBoard.filters.title") }}</h2>
          <section class="work-toolbar__section">
            <span class="work-toolbar__caption">{{ t("workBoard.field.team") }}</span>
            <AppChipTabs v-model="team" :options="teamOptions" data-testid="work-board-teams" />
          </section>
          <section class="work-toolbar__section">
            <span class="work-toolbar__caption">{{ t("workBoard.filters.labels") }}</span>
            <WorkBoardLabelFilter :labels="labels" :selected="selected" touch @toggle="(name) => emit('toggle-label', name)" />
          </section>
          <section class="work-toolbar__section">
            <span class="work-toolbar__caption">{{ t("workBoard.view.title") }}</span>
            <WorkBoardViewOptions
              v-model:out-of-step-only="outOfStepOnly"
              v-model:show-canceled="showCanceled"
              v-model:dense="dense"
              v-model:sort="sort"
              :out-of-step-count="outOfStepCount"
              :canceled-count="canceledCount"
              :token-count="tokenCount"
              :tokens-text="tokensText"
              :has-labels="labels.length > 0"
              touch
              @edit-labels="leaveFor('edit-labels')"
              @tokens="leaveFor('tokens')"
            />
          </section>
          <AppButton color="primary" variant="flat" block size="large" data-testid="work-board-sheet-done" @click="sheetOpen = false">
            {{ t("workBoard.filters.done") }}
          </AppButton>
        </VSheet>
      </VBottomSheet>
      <AppButton
        color="primary"
        icon="mdi-plus"
        size="large"
        elevation="4"
        class="work-toolbar__fab"
        :aria-label="t('workBoard.new')"
        data-testid="work-board-new"
        @click="emit('create')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VBottomSheet } from "vuetify/components/VBottomSheet";
import { AppChipTabs } from "@ui";
import AppButton from "../AppButton.vue";
import WorkBoardLabelFilter from "./WorkBoardLabelFilter.vue";
import WorkBoardViewOptions from "./WorkBoardViewOptions.vue";
import WorkLabelChip from "./WorkLabelChip.vue";
import { ALL_TEAMS } from "../../composables/useWorkBoard";
import type { WorkBoardSort, WorkLabel } from "../../types/workBoard";

/**
 * The top of the board (CORE-219 r2). Desktop: one row (team, search, Claude sessions, Filters,
 * View, New item); labels are picked under Filters and show only as removable chips; everything
 * about how the board looks sits under View, whose button counts what is switched on. Phone:
 * search, Claude sessions and one Filters button that opens a bottom sheet with the rest, plus a
 * floating "New item" above the bottom navigation.
 */
const props = defineProps<{
  teamOptions: readonly { value: string; label: string }[];
  labels: readonly WorkLabel[];
  selected: readonly string[];
  sessionCount: number;
  outOfStepCount: number;
  canceledCount: number;
  tokenCount: number | null;
  tokensText: string;
  compact: boolean;
}>();
const emit = defineEmits<{
  "toggle-label": [name: string];
  "clear-labels": [];
  "edit-labels": [];
  tokens: [];
  create: [];
}>();
const team = defineModel<string>("team", { required: true });
const query = defineModel<string | null>("query", { required: true });
const sessionsOnly = defineModel<boolean>("sessionsOnly", { required: true });
const sort = defineModel<WorkBoardSort>("sort", { required: true });
const dense = defineModel<boolean>("dense", { required: true });
const outOfStepOnly = defineModel<boolean>("outOfStepOnly", { required: true });
const showCanceled = defineModel<boolean>("showCanceled", { required: true });
const { t } = useI18n();

/** Above the fixed bottom navigation, like the app's other sheets. */
const OVER_BOTTOM_NAV = 10000;
const sheetOpen = ref(false);
const viewOpen = ref(false);
const searchRef = ref<{ focus: () => void } | null>(null);

/** What View has switched on that narrows or reshapes the board; the card density is only a look. */
const viewCount = computed(() => Number(outOfStepOnly.value) + Number(showCanceled.value) + Number(sort.value === "label"));
/** The phone's button stands for the team and View too, since they are out of sight there. */
const phoneCount = computed(() => Number(team.value !== ALL_TEAMS) + props.selected.length + viewCount.value);
const filtersText = computed(() => {
  const count = props.compact ? phoneCount.value : props.selected.length;
  return count ? t("workBoard.filters.count", { count }) : t("workBoard.filters.title");
});

/** The catalog and the tokens open as dialogs; the menu or sheet they were asked from steps aside. */
function leaveFor(what: "edit-labels" | "tokens"): void {
  viewOpen.value = false;
  sheetOpen.value = false;
  if (what === "tokens") emit("tokens");
  else emit("edit-labels");
}

defineExpose({ focusSearch: () => searchRef.value?.focus() });
</script>

<style scoped>
.work-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.work-toolbar__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

/* The chips scroll inside their own row, so they report no width of their own: the floor
   keeps the rest from squeezing them out, and a crowded row wraps instead (CORE-221). */
.work-toolbar__teams {
  flex: 1 1 auto;
  min-width: min(100%, 224px);
}

.work-toolbar__search {
  flex: 1 1 160px;
  min-width: 160px;
  max-width: 240px;
}

.work-toolbar__sessions {
  flex: none;
  min-height: 36px;
}

.work-toolbar__count {
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-toolbar__menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 320px;
  padding: 12px;
}

.work-toolbar__caption {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-toolbar__active {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

/* Phone: search takes what is left beside the two 44px targets. */
.work-toolbar--compact .work-toolbar__row {
  flex-wrap: nowrap;
  gap: 8px;
}

.work-toolbar--compact .work-toolbar__search {
  flex: 1 1 0;
  min-width: 0;
  max-width: none;
}

.work-toolbar--compact .work-toolbar__sessions {
  min-height: 44px;
}

.work-toolbar--compact :deep(.work-toolbar__sessions .work-label__name) {
  display: none;
}

.work-toolbar .work-toolbar__sheet-open {
  position: relative;
  flex: none;
  width: 44px;
  min-width: 44px;
  height: 44px;
  padding: 0;
}

.work-toolbar__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  padding: 0 4px;
  font-size: 0.6875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 20px;
  text-align: center;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  border-radius: 10px;
}

.work-toolbar__sheet {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 85vh;
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
}

.work-toolbar__sheet-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.work-toolbar__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* Floats over the list, clear of the bottom navigation and the home indicator. */
.work-toolbar__fab {
  position: fixed;
  right: 16px;
  bottom: calc(var(--mobile-bottom-nav-height, 56px) + 2 * var(--mobile-bottom-nav-float, 10px) + 12px + env(safe-area-inset-bottom, 0px));
  z-index: 5;
}
</style>
