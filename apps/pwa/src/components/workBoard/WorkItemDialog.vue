<template>
  <AppFormDialog
    :model-value="open"
    :title="creating ? t('workBoard.dialog.newTitle') : (loaded?.item.key ?? itemKey ?? '')"
    max-width="720"
    @update:model-value="(v: boolean) => !v && emit('close')"
    @close="emit('close')"
  >
    <AppLoadingState v-if="loading" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :refresh-label="t('app.errorState.refresh')"
      @refresh="load"
    />
    <div v-else class="work-dialog" data-testid="work-item-dialog">
      <div class="work-dialog__row">
        <VSelect
          v-if="creating"
          v-model="form.team"
          :items="teamItems"
          :label="t('workBoard.field.team')"
          variant="outlined"
          hide-details
          data-testid="work-item-team"
        />
        <VSelect
          v-model="form.status"
          :items="statusItems"
          :label="t('workBoard.field.status')"
          variant="outlined"
          hide-details
          data-testid="work-item-status"
        />
        <VSelect
          v-model="form.priority"
          :items="priorityItems"
          :label="t('workBoard.field.priority')"
          variant="outlined"
          hide-details
          data-testid="work-item-priority"
        />
      </div>
      <VTextField
        v-model="form.title"
        :label="t('workBoard.field.title')"
        :counter="TITLE_MAX"
        :maxlength="TITLE_MAX"
        variant="outlined"
        autofocus
        data-testid="work-item-title"
      />
      <VTextarea
        v-for="name in BODY_FIELDS"
        :key="name"
        v-model="form[name]"
        :label="t(`workBoard.field.${name}`)"
        :maxlength="BODY_MAX"
        variant="outlined"
        rows="2"
        auto-grow
        hide-details="auto"
        :data-testid="`work-item-${name}`"
      />

      <template v-if="loaded">
        <div v-if="loaded.item.links.length || loaded.item.branch" class="work-dialog__section">
          <span class="work-dialog__label">{{ t("workBoard.dialog.links") }}</span>
          <ul class="work-dialog__links">
            <li v-for="link in loaded.item.links" :key="link.url">
              <a :href="link.url" target="_blank" rel="noopener">{{ link.title || t(`workBoard.link.${link.kind}`) }}</a>
            </li>
            <li v-if="loaded.item.branch" class="work-dialog__branch">{{ loaded.item.branch }}</li>
          </ul>
        </div>

        <div class="work-dialog__section">
          <span class="work-dialog__label">{{ t("workBoard.dialog.history") }}</span>
          <ol class="work-dialog__events" data-testid="work-item-events">
            <li v-for="event in loaded.events" :key="event.id" class="work-dialog__event">
              <span class="work-dialog__event-meta">
                {{ actorLabel(event) }} · {{ formatRelativeTime(event.created_at, locale) }}
              </span>
              <span class="work-dialog__event-text">{{ eventText(event) }}</span>
            </li>
          </ol>
          <div class="work-dialog__comment">
            <VTextarea
              v-model="comment"
              :label="t('workBoard.dialog.comment')"
              variant="outlined"
              rows="1"
              auto-grow
              hide-details
              data-testid="work-item-comment"
            />
            <AppButton variant="tonal" :loading="commenting" :disabled="!comment.trim()" data-testid="work-item-comment-send" @click="sendComment">
              {{ t("workBoard.dialog.send") }}
            </AppButton>
          </div>
        </div>
      </template>
    </div>
    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="emit('close')">{{ t("app.common.close") }}</AppButton>
      <AppButton color="primary" variant="flat" :loading="saving" :disabled="!canSave" data-testid="work-item-save" @click="save">
        {{ creating ? t("workBoard.dialog.create") : t("workBoard.dialog.save") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import {
  WORK_PRIORITIES,
  WORK_STATUS_OPTIONS,
  addWorkItemComment,
  createWorkItem,
  fetchWorkItem,
  patchWorkItem,
} from "../../composables/useWorkBoard";
import { formatRelativeTime } from "../../utils/relativeTime";
import type { WorkItem, WorkItemEvent, WorkItemPatch, WorkStatus, WorkTeam } from "../../types/workBoard";

/**
 * Work item detail (itemKey set) or a new item (creating). Problem / Change / Done when are
 * the ticket body; the history is the API's append-only event trail.
 */
const props = defineProps<{
  itemKey: string | null;
  creating: boolean;
  teams: readonly WorkTeam[];
  defaultTeam: string | null;
}>();
const emit = defineEmits<{ close: []; saved: [item: WorkItem] }>();
const { t, locale } = useI18n();

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const BODY_FIELDS = ["problem", "change", "done_when"] as const;

const open = computed(() => props.creating || props.itemKey !== null);
const loading = ref(false);
const loadFailure = ref<unknown>(null);
const loaded = ref<{ item: WorkItem; events: WorkItemEvent[] } | null>(null);
const saving = ref(false);
const comment = ref("");
const commenting = ref(false);

interface Form {
  team: string;
  title: string;
  problem: string;
  change: string;
  done_when: string;
  status: WorkStatus;
  priority: number;
}
const form = reactive<Form>(blankForm());

function blankForm(): Form {
  return { team: props.defaultTeam ?? props.teams[0]?.key ?? "", title: "", problem: "", change: "", done_when: "", status: "backlog", priority: 0 };
}

function formFrom(item: WorkItem): Form {
  return {
    team: item.team_key,
    title: item.title,
    problem: item.problem ?? "",
    change: item.change ?? "",
    done_when: item.done_when ?? "",
    status: item.status,
    priority: item.priority,
  };
}

const teamItems = computed(() => props.teams.map((team) => ({ value: team.key, title: `${team.key} · ${team.name}` })));
const statusItems = computed(() => WORK_STATUS_OPTIONS.map((value) => ({ value, title: t(`workBoard.status.${value}`) })));
const priorityItems = computed(() => WORK_PRIORITIES.map((value) => ({ value, title: t(`workBoard.priority.p${value}`) })));

const patch = computed<WorkItemPatch>(() => {
  if (!loaded.value) return {};
  const before = formFrom(loaded.value.item);
  const out: WorkItemPatch = {};
  if (form.title.trim() !== before.title) out.title = form.title.trim();
  for (const name of BODY_FIELDS) if (form[name].trim() !== before[name]) out[name] = form[name].trim() || null;
  if (form.status !== before.status) out.status = form.status;
  if (form.priority !== before.priority) out.priority = form.priority;
  return out;
});

const canSave = computed(() => {
  if (!form.title.trim()) return false;
  return props.creating ? !!form.team : Object.keys(patch.value).length > 0;
});

async function load(): Promise<void> {
  if (!props.itemKey) return;
  loading.value = true;
  loadFailure.value = null;
  try {
    loaded.value = await fetchWorkItem(props.itemKey);
    Object.assign(form, formFrom(loaded.value.item));
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.itemKey, props.creating] as const,
  () => {
    loaded.value = null;
    comment.value = "";
    Object.assign(form, blankForm());
    void load();
  },
  { immediate: true },
);

async function save(): Promise<void> {
  saving.value = true;
  try {
    if (props.creating) {
      const item = await createWorkItem({
        team: form.team,
        title: form.title.trim(),
        problem: form.problem.trim() || null,
        change: form.change.trim() || null,
        done_when: form.done_when.trim() || null,
        status: form.status,
        priority: form.priority,
      });
      emit("saved", item);
      return;
    }
    if (!loaded.value) return;
    const item = await patchWorkItem(loaded.value.item.key, patch.value);
    emit("saved", item);
    await load();
  } catch {
    // benign: useWorkBoard already reported it; the form stays open with the edits
  } finally {
    saving.value = false;
  }
}

async function sendComment(): Promise<void> {
  if (!loaded.value || !comment.value.trim()) return;
  commenting.value = true;
  try {
    const event = await addWorkItemComment(loaded.value.item.key, comment.value.trim());
    loaded.value.events.push(event);
    comment.value = "";
  } catch {
    // benign: useWorkBoard already reported it; the draft stays
  } finally {
    commenting.value = false;
  }
}

function actorLabel(event: WorkItemEvent): string {
  if (event.actor_kind === "agent") return t("workBoard.actor.agent");
  if (event.actor_kind === "import") return t("workBoard.actor.import");
  return event.actor ?? "";
}

function eventText(event: WorkItemEvent): string {
  switch (event.kind) {
    case "created":
      return t("workBoard.event.created", { status: t(`workBoard.status.${event.to_status ?? "backlog"}`) });
    case "status":
      return t("workBoard.event.status", {
        from: t(`workBoard.status.${event.from_status ?? "backlog"}`),
        to: t(`workBoard.status.${event.to_status ?? "backlog"}`),
      });
    case "edit":
      return t("workBoard.event.edit", { fields: event.body ?? "" });
    default:
      return event.body ?? "";
  }
}
</script>

<style scoped>
.work-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.work-dialog__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.work-dialog__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.work-dialog__label {
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-dialog__links {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
}

.work-dialog__links a {
  color: rgb(var(--v-theme-primary));
  overflow-wrap: anywhere;
}

.work-dialog__branch {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8125rem;
}

.work-dialog__events {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.work-dialog__event {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.work-dialog__event-meta {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-dialog__event-text {
  font-size: 0.875rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.work-dialog__comment {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
</style>
