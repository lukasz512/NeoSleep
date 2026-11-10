<template>
  <AppFormDialog
    :model-value="open"
    :title="creating ? t('workBoard.dialog.newTitle') : (loaded?.item.key ?? itemKey ?? '')"
    max-width="760"
    fill
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
    <div
      v-else
      class="work-dialog"
      :class="{ 'work-dialog--dragging': dragging }"
      data-testid="work-item-dialog"
      @paste="onPaste"
      @dragover.prevent="dragging = true"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <VTextarea
        v-model="form.title"
        class="work-dialog__title"
        :placeholder="t('workBoard.field.title')"
        :aria-label="t('workBoard.field.title')"
        :maxlength="TITLE_MAX"
        variant="plain"
        rows="1"
        auto-grow
        hide-details
        autofocus
        data-testid="work-item-title"
        @keydown.enter.prevent
      />

      <div class="work-dialog__chips" data-testid="work-item-chips">
        <VMenu v-for="chip in listChips" :key="chip.name">
          <template #activator="{ props: activator }">
            <VChip v-bind="activator" :prepend-icon="chip.icon" variant="tonal" size="small" :data-testid="`work-item-${chip.name}`">
              {{ chip.label }}
            </VChip>
          </template>
          <VList density="compact" :data-testid="`work-item-${chip.name}-menu`">
            <VListItem
              v-for="option in chip.options"
              :key="String(option.value)"
              :title="option.title"
              :active="option.value === chip.value"
              @click="chip.select(option.value)"
            />
          </VList>
        </VMenu>

        <VMenu :close-on-content-click="false">
          <template #activator="{ props: activator }">
            <VChip v-bind="activator" prepend-icon="mdi-calendar-outline" variant="tonal" size="small" data-testid="work-item-due">
              {{ form.due_date ? formatDueDate(form.due_date) : t("workBoard.dialog.noDueDate") }}
            </VChip>
          </template>
          <VCard class="work-dialog__due-menu">
            <VTextField
              v-model="form.due_date"
              type="date"
              :label="t('workBoard.field.due_date')"
              variant="outlined"
              hide-details
              data-testid="work-item-due-input"
            />
            <AppButton variant="text" size="small" :disabled="!form.due_date" @click="form.due_date = ''">
              {{ t("workBoard.dialog.clearDueDate") }}
            </AppButton>
          </VCard>
        </VMenu>

        <VMenu v-if="developmentCount">
          <template #activator="{ props: activator }">
            <VChip v-bind="activator" prepend-icon="mdi-source-branch" variant="tonal" size="small" data-testid="work-item-development">
              {{ t("workBoard.dialog.development") }} · {{ developmentCount }}
            </VChip>
          </template>
          <VList density="compact">
            <VListItem
              v-for="link in loaded?.item.links ?? []"
              :key="link.url"
              :href="link.url"
              target="_blank"
              rel="noopener"
              :title="link.title || t(`workBoard.link.${link.kind}`)"
              :subtitle="t(`workBoard.link.${link.kind}`)"
            />
            <VListItem v-if="loaded?.item.branch" :title="loaded.item.branch" class="work-dialog__branch" />
          </VList>
        </VMenu>
      </div>

      <VTextarea
        v-model="form.problem"
        :placeholder="t('workBoard.dialog.descriptionPlaceholder')"
        :aria-label="t('workBoard.field.problem')"
        :maxlength="BODY_MAX"
        variant="outlined"
        rows="4"
        auto-grow
        hide-details
        data-testid="work-item-problem"
      />

      <div v-for="name in SECTION_FIELDS" v-show="shown[name]" :key="name" class="work-dialog__section">
        <span class="work-dialog__label">{{ t(`workBoard.field.${name}`) }}</span>
        <VTextarea
          v-model="form[name]"
          :aria-label="t(`workBoard.field.${name}`)"
          :maxlength="BODY_MAX"
          variant="outlined"
          rows="2"
          auto-grow
          hide-details
          :data-testid="`work-item-${name}`"
        />
      </div>

      <div class="work-dialog__tools">
        <AppButton
          v-for="name in hiddenSections"
          :key="name"
          variant="text"
          size="small"
          prepend-icon="mdi-plus"
          :data-testid="`work-item-add-${name}`"
          @click="shown[name] = true"
        >
          {{ t(`workBoard.field.${name}`) }}
        </AppButton>
        <VSpacer />
        <AppButton variant="text" size="small" prepend-icon="mdi-paperclip" data-testid="work-item-attach" @click="itemPicker?.click()">
          {{ t("workBoard.dialog.attach") }}
        </AppButton>
        <input
          ref="itemPicker"
          type="file"
          class="work-dialog__picker"
          :accept="WORK_ATTACHMENT_ACCEPT"
          multiple
          data-testid="work-item-file"
          @change="onPick($event, 'item')"
        />
      </div>

      <ul v-if="itemAttachments.length || itemQueue.pending.value.length" class="work-dialog__files" data-testid="work-item-attachments">
        <li v-for="file in itemAttachments" :key="file.id" class="work-dialog__file" data-testid="work-item-attachment">
          <button type="button" class="work-dialog__thumb" :aria-label="file.filename" @click="openAttachment(file)">
            <img v-if="isImage(file.mime_type) && urls[file.id]" :src="urls[file.id]" :alt="file.filename" />
            <VIcon v-else :icon="isImage(file.mime_type) ? 'mdi-image-outline' : 'mdi-file-pdf-box'" size="28" />
          </button>
          <span class="work-dialog__file-name">{{ file.filename }}</span>
          <button
            type="button"
            class="work-dialog__file-remove"
            :aria-label="t('workBoard.dialog.removeAttachment', { name: file.filename })"
            @click="removeAttachment(file)"
          >
            <VIcon icon="mdi-close" size="16" />
          </button>
        </li>
        <li v-for="file in itemQueue.pending.value" :key="`p${file.id}`" class="work-dialog__file work-dialog__file--pending" data-testid="work-item-pending">
          <span class="work-dialog__thumb">
            <img v-if="file.preview" :src="file.preview" :alt="file.file.name" />
            <VIcon v-else icon="mdi-file-pdf-box" size="28" />
            <AppSpinner v-if="uploading.has(file.id)" class="work-dialog__thumb-spinner" size="20" width="2" />
          </span>
          <span class="work-dialog__file-name">{{ file.file.name }}</span>
          <button
            type="button"
            class="work-dialog__file-remove"
            :aria-label="t('workBoard.dialog.removeAttachment', { name: file.file.name })"
            @click="itemQueue.remove(file.id)"
          >
            <VIcon icon="mdi-close" size="16" />
          </button>
        </li>
      </ul>
      <p v-if="rejectionText" class="work-dialog__rejected" role="alert" data-testid="work-item-rejected">{{ rejectionText }}</p>
      <p v-else class="work-dialog__hint">{{ t(dragging ? "workBoard.dialog.dropHere" : "workBoard.dialog.attachHint") }}</p>

      <template v-if="loaded">
        <div class="work-dialog__section">
          <span class="work-dialog__label">{{ t("workBoard.dialog.history") }}</span>
          <ol class="work-dialog__events" data-testid="work-item-events">
            <li v-for="event in loaded.events" :key="event.id" class="work-dialog__event">
              <span class="work-dialog__event-meta">
                {{ actorLabel(event) }} · {{ formatRelativeTime(event.created_at, locale) }}
              </span>
              <span class="work-dialog__event-text">{{ eventText(event) }}</span>
              <span v-if="attachmentsOf(event.id).length" class="work-dialog__event-files">
                <button
                  v-for="file in attachmentsOf(event.id)"
                  :key="file.id"
                  type="button"
                  class="work-dialog__thumb work-dialog__thumb--small"
                  :aria-label="file.filename"
                  @click="openAttachment(file)"
                >
                  <img v-if="isImage(file.mime_type) && urls[file.id]" :src="urls[file.id]" :alt="file.filename" />
                  <VIcon v-else :icon="isImage(file.mime_type) ? 'mdi-image-outline' : 'mdi-file-pdf-box'" size="20" />
                </button>
              </span>
            </li>
          </ol>
          <div class="work-dialog__comment" data-comment-box>
            <VTextarea
              v-model="comment"
              :label="t('workBoard.dialog.comment')"
              variant="outlined"
              rows="1"
              auto-grow
              hide-details
              data-testid="work-item-comment"
            />
            <AppButton
              icon="mdi-paperclip"
              variant="text"
              size="small"
              :aria-label="t('workBoard.dialog.attachComment')"
              data-testid="work-item-comment-attach"
              @click="commentPicker?.click()"
            />
            <input
              ref="commentPicker"
              type="file"
              class="work-dialog__picker"
              :accept="WORK_ATTACHMENT_ACCEPT"
              multiple
              @change="onPick($event, 'comment')"
            />
            <AppButton variant="tonal" :loading="commenting" :disabled="!canComment" data-testid="work-item-comment-send" @click="sendComment">
              {{ t("workBoard.dialog.send") }}
            </AppButton>
          </div>
          <ul v-if="commentQueue.pending.value.length" class="work-dialog__files" data-testid="work-item-comment-pending">
            <li v-for="file in commentQueue.pending.value" :key="file.id" class="work-dialog__file work-dialog__file--pending">
              <span class="work-dialog__thumb work-dialog__thumb--small">
                <img v-if="file.preview" :src="file.preview" :alt="file.file.name" />
                <VIcon v-else icon="mdi-file-pdf-box" size="20" />
              </span>
              <span class="work-dialog__file-name">{{ file.file.name }}</span>
              <button
                type="button"
                class="work-dialog__file-remove"
                :aria-label="t('workBoard.dialog.removeAttachment', { name: file.file.name })"
                @click="commentQueue.remove(file.id)"
              >
                <VIcon icon="mdi-close" size="16" />
              </button>
            </li>
          </ul>
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
import AppSpinner from "../AppSpinner.vue";
import AppLoadingState from "../AppLoadingState.vue";
import AppErrorState from "../AppErrorState.vue";
import {
  WORK_PRIORITIES,
  WORK_STATUS_OPTIONS,
  addWorkItemComment,
  createWorkItem,
  deleteWorkAttachment,
  fetchAttachmentUrl,
  fetchWorkItem,
  fetchWorkPeople,
  patchWorkItem,
  uploadWorkAttachment,
  type WorkItemDetail,
} from "../../composables/useWorkBoard";
import { WORK_ATTACHMENT_ACCEPT, filesFromTransfer, isImage, usePendingAttachments, type PendingAttachment } from "../../composables/useWorkAttachments";
import { formatRelativeTime } from "../../utils/relativeTime";
import type { WorkAttachment, WorkItem, WorkItemEvent, WorkItemPatch, WorkPerson, WorkStatus, WorkTeam } from "../../types/workBoard";

/**
 * Work item detail (itemKey set) or a new item (creating), one column like Linear (CORE-192,
 * docs/stories/work-board-task-form-attachments.md): an inline title, a chip row for the
 * properties, the description (the `problem` field), and Change / Done when as sections added
 * on demand. Screenshots go in by paste, drop or the picker (camera on phones); on a new item
 * they wait and upload right after Create. The history is the API's append-only event trail.
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
const SECTION_FIELDS = ["change", "done_when"] as const;
type SectionField = (typeof SECTION_FIELDS)[number];

const open = computed(() => props.creating || props.itemKey !== null);
const loading = ref(false);
const loadFailure = ref<unknown>(null);
const loaded = ref<WorkItemDetail | null>(null);
const saving = ref(false);
const comment = ref("");
const commenting = ref(false);
const people = ref<WorkPerson[]>([]);
const shown = reactive<Record<SectionField, boolean>>({ change: false, done_when: false });

const itemQueue = usePendingAttachments();
const commentQueue = usePendingAttachments();
const uploading = reactive(new Set<number>());
const urls = reactive<Record<string, string>>({});
const dragging = ref(false);
const itemPicker = ref<HTMLInputElement | null>(null);
const commentPicker = ref<HTMLInputElement | null>(null);

interface Form {
  team: string;
  title: string;
  problem: string;
  change: string;
  done_when: string;
  status: WorkStatus;
  priority: number;
  assignee: string | null;
  /** YYYY-MM-DD, or "" for none (what a date input gives). */
  due_date: string;
}
const form = reactive<Form>(blankForm());

function blankForm(): Form {
  return {
    team: props.defaultTeam ?? props.teams[0]?.key ?? "",
    title: "",
    problem: "",
    change: "",
    done_when: "",
    status: "backlog",
    priority: 0,
    assignee: null,
    due_date: "",
  };
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
    assignee: item.assignee,
    due_date: item.due_date ?? "",
  };
}

interface ListChip {
  name: string;
  icon: string;
  label: string;
  value: string | number | null;
  options: { value: string | number | null; title: string }[];
  select: (value: string | number | null) => void;
}

function personLabel(email: string): string {
  return people.value.find((p) => p.email === email)?.name || email;
}

const listChips = computed<ListChip[]>(() => {
  const chips: ListChip[] = [];
  if (props.creating) {
    chips.push({
      name: "team",
      icon: "mdi-account-group-outline",
      label: form.team || t("workBoard.field.team"),
      value: form.team,
      options: props.teams.map((team) => ({ value: team.key, title: `${team.key} · ${team.name}` })),
      select: (v) => (form.team = String(v)),
    });
  }
  chips.push(
    {
      name: "status",
      icon: "mdi-circle-half-full",
      label: t(`workBoard.status.${form.status}`),
      value: form.status,
      options: WORK_STATUS_OPTIONS.map((value) => ({ value, title: t(`workBoard.status.${value}`) })),
      select: (v) => (form.status = v as WorkStatus),
    },
    {
      name: "priority",
      icon: "mdi-signal-cellular-2",
      label: t(`workBoard.priority.p${form.priority}`),
      value: form.priority,
      options: WORK_PRIORITIES.map((value) => ({ value, title: t(`workBoard.priority.p${value}`) })),
      select: (v) => (form.priority = Number(v)),
    },
    {
      name: "assignee",
      icon: "mdi-account-circle-outline",
      label: form.assignee ? personLabel(form.assignee) : t("workBoard.dialog.unassigned"),
      value: form.assignee,
      options: [{ value: null, title: t("workBoard.dialog.unassigned") }, ...people.value.map((p) => ({ value: p.email, title: p.name || p.email }))],
      select: (v) => (form.assignee = v === null ? null : String(v)),
    },
  );
  return chips;
});

const hiddenSections = computed(() => SECTION_FIELDS.filter((name) => !shown[name]));
const developmentCount = computed(() => (loaded.value ? loaded.value.item.links.length + (loaded.value.item.branch ? 1 : 0) : 0));
const itemAttachments = computed(() => loaded.value?.attachments.filter((a) => a.event_id === null) ?? []);

function attachmentsOf(eventId: string): WorkAttachment[] {
  return loaded.value?.attachments.filter((a) => a.event_id !== null && String(a.event_id) === String(eventId)) ?? [];
}

const rejectionText = computed(() => {
  const reason = itemQueue.rejected.value ?? commentQueue.rejected.value;
  return reason ? t(reason === "type" ? "workBoard.dialog.rejectedType" : "workBoard.dialog.rejectedSize") : "";
});

const patch = computed<WorkItemPatch>(() => {
  if (!loaded.value) return {};
  const before = formFrom(loaded.value.item);
  const out: WorkItemPatch = {};
  if (form.title.trim() !== before.title) out.title = form.title.trim();
  for (const name of BODY_FIELDS) if (form[name].trim() !== before[name]) out[name] = form[name].trim() || null;
  if (form.status !== before.status) out.status = form.status;
  if (form.priority !== before.priority) out.priority = form.priority;
  if (form.assignee !== before.assignee) out.assignee = form.assignee;
  if (form.due_date !== before.due_date) out.due_date = form.due_date || null;
  return out;
});

const canSave = computed(() => {
  if (!form.title.trim()) return false;
  return props.creating ? !!form.team : Object.keys(patch.value).length > 0;
});
const canComment = computed(() => !!comment.value.trim() || commentQueue.pending.value.length > 0);

function formatDueDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(locale.value === "mx" ? "es-MX" : locale.value, { day: "numeric", month: "short" });
}

async function load(): Promise<void> {
  if (!props.itemKey) return;
  loading.value = true;
  loadFailure.value = null;
  try {
    loaded.value = await fetchWorkItem(props.itemKey);
    Object.assign(form, formFrom(loaded.value.item));
    for (const name of SECTION_FIELDS) shown[name] = !!form[name];
    void signImages(loaded.value.item.key, loaded.value.attachments);
  } catch (err) {
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}

async function loadPeople(): Promise<void> {
  try {
    people.value = await fetchWorkPeople();
  } catch {
    // benign: useWorkBoard already reported it; the assignee menu offers only "Unassigned"
  }
}

/** Thumbnails need a signed URL each; a failure leaves the icon. */
async function signImages(key: string, files: readonly WorkAttachment[]): Promise<void> {
  await Promise.all(
    files
      .filter((file) => isImage(file.mime_type) && !urls[file.id])
      .map(async (file) => {
        try {
          urls[file.id] = await fetchAttachmentUrl(key, file.id);
        } catch {
          // benign: reported by useWorkBoard; the tile shows an icon instead
        }
      }),
  );
}

watch(
  () => [props.itemKey, props.creating] as const,
  () => {
    loaded.value = null;
    comment.value = "";
    Object.assign(form, blankForm());
    shown.change = false;
    shown.done_when = false;
    itemQueue.clear();
    commentQueue.clear();
    if (open.value && !people.value.length) void loadPeople();
    void load();
  },
  { immediate: true },
);

function route(files: File[], target: "item" | "comment"): void {
  if (!files.length) return;
  if (target === "comment") {
    commentQueue.add(files);
    return;
  }
  const added = itemQueue.add(files);
  if (loaded.value) void uploadQueued(loaded.value.item.key, added);
}

/** Uploads queued item files one by one; each leaves the queue once it is stored. */
async function uploadQueued(key: string, entries: readonly PendingAttachment[]): Promise<void> {
  for (const entry of entries) {
    uploading.add(entry.id);
    try {
      const attachment = await uploadWorkAttachment(key, entry.file);
      if (loaded.value?.item.key === key) {
        loaded.value.attachments.push(attachment);
        void signImages(key, [attachment]);
      }
      itemQueue.remove(entry.id);
    } catch {
      // benign: useWorkBoard already reported it; the file stays in the queue to remove or retry
    } finally {
      uploading.delete(entry.id);
    }
  }
}

function onPaste(event: ClipboardEvent): void {
  const files = filesFromTransfer(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  const inComment = event.target instanceof Element && event.target.closest("[data-comment-box]") !== null;
  route(files, inComment ? "comment" : "item");
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const inComment = event.target instanceof Element && event.target.closest("[data-comment-box]") !== null;
  route(filesFromTransfer(event.dataTransfer), inComment ? "comment" : "item");
}

function onDragLeave(event: DragEvent): void {
  if (!(event.currentTarget instanceof Element) || !(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
    dragging.value = false;
  }
}

function onPick(event: Event, target: "item" | "comment"): void {
  const input = event.target as HTMLInputElement;
  route(Array.from(input.files ?? []), target);
  input.value = "";
}

async function openAttachment(file: WorkAttachment): Promise<void> {
  if (!loaded.value) return;
  // Opened before the await so Safari keeps it as a user gesture, then pointed at the fresh URL.
  // ("noopener" would make window.open return null, so the opener is cut by hand.)
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = await fetchAttachmentUrl(loaded.value.item.key, file.id);
    if (tab) tab.location.href = url;
  } catch {
    tab?.close();
  }
}

async function removeAttachment(file: WorkAttachment): Promise<void> {
  if (!loaded.value) return;
  try {
    await deleteWorkAttachment(loaded.value.item.key, file.id);
    loaded.value.attachments = loaded.value.attachments.filter((a) => a.id !== file.id);
  } catch {
    // benign: useWorkBoard already reported it; the tile stays
  }
}

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
        assignee: form.assignee,
        due_date: form.due_date || null,
      });
      await uploadQueued(item.key, [...itemQueue.pending.value]);
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
  if (!loaded.value || !canComment.value) return;
  const key = loaded.value.item.key;
  commenting.value = true;
  try {
    // Files without text belong to the item itself.
    const event = comment.value.trim() ? await addWorkItemComment(key, comment.value.trim()) : null;
    if (event) loaded.value.events.push(event);
    comment.value = "";
    for (const entry of [...commentQueue.pending.value]) {
      const attachment = await uploadWorkAttachment(key, entry.file, event ? String(event.id) : null);
      loaded.value.attachments.push(attachment);
      commentQueue.remove(entry.id);
    }
    void signImages(key, loaded.value.attachments);
  } catch {
    // benign: useWorkBoard already reported it; what was not sent stays in the composer
  } finally {
    commenting.value = false;
  }
}

function actorLabel(event: WorkItemEvent): string {
  if (event.actor_kind === "agent") return t("workBoard.actor.agent");
  if (event.actor_kind === "import") return t("workBoard.actor.import");
  if (event.actor_kind === "session") return t("workBoard.actor.session", { name: (event.actor ?? "").replace(/^session:/, "") });
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
  gap: 12px;
  border-radius: 12px;
  outline: 2px dashed transparent;
  outline-offset: 4px;
  transition: outline-color 0.15s ease;
}

.work-dialog--dragging {
  outline-color: rgb(var(--v-theme-primary));
}

.work-dialog__title :deep(textarea) {
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.3;
  padding-top: 0;
}

.work-dialog__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.work-dialog__due-menu {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  padding: 12px;
  min-width: 220px;
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

.work-dialog__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.work-dialog__picker {
  display: none;
}

.work-dialog__files {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.work-dialog__file {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 96px;
}

.work-dialog__file--pending .work-dialog__thumb {
  opacity: 0.72;
}

.work-dialog__thumb {
  position: relative;
  display: grid;
  place-items: center;
  width: 96px;
  height: 72px;
  overflow: hidden;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  cursor: pointer;
}

.work-dialog__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.work-dialog__thumb--small {
  width: 48px;
  height: 36px;
  border-radius: 4px;
}

.work-dialog__thumb-spinner {
  position: absolute;
}

.work-dialog__file-name {
  overflow: hidden;
  font-size: 0.75rem;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.work-dialog__file-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 1px rgba(var(--v-border-color), var(--v-border-opacity));
}

.work-dialog__hint,
.work-dialog__rejected {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-dialog__rejected {
  color: rgb(var(--v-theme-error));
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

.work-dialog__event-files {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.work-dialog__comment {
  display: flex;
  align-items: flex-end;
  gap: 4px;
}
</style>
