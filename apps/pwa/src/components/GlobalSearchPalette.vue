<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppIcon from "./AppIcon.vue";
import { MAX_AI_QUESTION_CHARS } from "../composables/useAiChat";
import { useAiConversation } from "../composables/useAiConversation";
import { canUseAi } from "../composables/canUseAi";
import { useGlobalSearch, SEARCH_MIN_CHARS, type SearchHit } from "../composables/useGlobalSearch";
import { useVisibleNavRoutes } from "../composables/useVisibleNavRoutes";
import { MOBILE_BREAKPOINT } from "../config/layout";
import { useAuthStore } from "../stores/auth";
import { useRolePreviewStore } from "../stores/rolePreview";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const rolePreviewStore = useRolePreviewStore();
const { visibleNavItems } = useVisibleNavRoutes();
const search = useGlobalSearch();
const ai = useAiConversation();

const uid = Math.random().toString(36).slice(2, 8);
const listboxId = `gs-list-${uid}`;
const COUNTER_FROM = 400;

const role = computed(() => rolePreviewStore.previewRole ?? authStore.user?.role);
const aiAllowed = computed(() => canUseAi(role.value));

const aiMode = ref(false);
const active = ref(-1);
const isPhone = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);
const aiEl = ref<HTMLTextAreaElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);

type Row = { key: string; id: string; label: string; sublabel: string; group: string; icon: string; go: () => void };

const termText = computed(() => search.term.value.trim());
const searching = computed(() => termText.value.length >= SEARCH_MIN_CHARS);

function hitRows(group: "patients" | "practitioners" | "organizations", kind: string, routeName: string): Row[] {
  const hits: SearchHit[] = search.groups.value?.[group] ?? [];
  return hits.map((h) => ({
    key: `${kind}-${h.id}`,
    id: `${listboxId}-${kind}-${h.id}`,
    label: h.label,
    sublabel: h.sublabel,
    group: kind,
    icon: group === "patients" ? "nav-patients" : group === "practitioners" ? "nav-hcp" : "nav-hco",
    go: () => void goTo({ name: routeName, params: { id: h.id } }),
  }));
}

const pageRows = computed<Row[]>(() => {
  const needle = termText.value.toLowerCase();
  return visibleNavItems.value
    .filter((p) => !needle || p.label.toLowerCase().includes(needle))
    .map((p) => ({
      key: `page-${p.name}`,
      id: `${listboxId}-page-${p.name}`,
      label: p.label,
      sublabel: "",
      group: "page",
      icon: `nav-${p.name}`,
      go: () => void goTo({ path: p.path }),
    }));
});

const aiRow = computed<Row | null>(() =>
  aiAllowed.value && searching.value
    ? {
        key: "ai",
        id: `${listboxId}-ai`,
        label: t("search.ai.entry", { question: termText.value }),
        sublabel: "",
        group: "ai",
        icon: "nav-ai",
        go: () => openAi(),
      }
    : null,
);

const sections = computed(() => {
  const out: { group: string; title: string; rows: Row[] }[] = [];
  if (searching.value) {
    out.push({ group: "patient", title: t("search.patients"), rows: hitRows("patients", "patient", "patient-detail") });
    out.push({ group: "practitioner", title: t("search.practitioners"), rows: hitRows("practitioners", "practitioner", "hcp-detail") });
    out.push({ group: "organization", title: t("search.organizations"), rows: hitRows("organizations", "organization", "hco-detail") });
  }
  out.push({ group: "page", title: t("search.pages"), rows: pageRows.value });
  const filtered = out.filter((s) => s.rows.length > 0);
  if (aiRow.value) filtered.push({ group: "ai", title: "", rows: [aiRow.value] });
  return filtered;
});

const rows = computed(() => sections.value.flatMap((s) => s.rows));
const activeId = computed(() => (active.value >= 0 ? rows.value[active.value]?.id : undefined));

const resultCount = computed(() => (searching.value ? search.total.value + pageRows.value.length : pageRows.value.length));
const statusKey = computed(() => {
  if (!searching.value) return "";
  if (search.status.value === "loading") return "search.loading";
  if (search.status.value === "rate_limited") return "search.rate_limited";
  if (search.status.value === "error") return "search.error";
  if (search.status.value === "ok" && resultCount.value === 0) return "search.empty";
  return "";
});
const liveText = computed(() => (search.status.value === "ok" || !searching.value ? t("search.count", { n: resultCount.value }, resultCount.value) : ""));

const aiLength = computed(() => ai.question.value.length);
const aiOver = computed(() => aiLength.value > MAX_AI_QUESTION_CHARS);

watch(rows, (list) => {
  if (active.value >= list.length) active.value = list.length - 1;
});
watch(
  () => search.term.value,
  () => {
    active.value = -1;
  },
);

watch(
  () => props.open,
  async (open) => {
    if (open) {
      isPhone.value = typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
      await nextTick();
      inputEl.value?.focus();
    } else {
      search.clear();
      ai.reset();
      aiMode.value = false;
      active.value = -1;
    }
  },
);

function close(): void {
  emit("update:open", false);
}

async function goTo(target: { name: string; params: { id: string } } | { path: string }): Promise<void> {
  close();
  await router.push(target);
}

function openAi(): void {
  ai.question.value = termText.value;
  aiMode.value = true;
  void ai.ask();
}

async function backToSearch(): Promise<void> {
  aiMode.value = false;
  await nextTick();
  inputEl.value?.focus();
}

function move(delta: number): void {
  const n = rows.value.length;
  if (n === 0) return;
  active.value = active.value < 0 ? (delta > 0 ? 0 : n - 1) : (active.value + delta + n) % n;
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if ((e.metaKey || e.ctrlKey) && aiAllowed.value && searching.value) {
      openAi();
      return;
    }
    rows.value[active.value]?.go();
  }
}

function onAiKeydown(e: KeyboardEvent): void {
  if (e.isComposing) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void ai.ask();
  }
}

function onDialogKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    e.preventDefault();
    if (aiMode.value) void backToSearch();
    else close();
    return;
  }
  if (e.key !== "Tab" || !dialogEl.value) return;
  const items = Array.from(dialogEl.value.querySelectorAll<HTMLElement>("button, input, textarea, [tabindex]:not([tabindex='-1'])")).filter(
    (el) => !el.hasAttribute("disabled"),
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

let dragStart: number | null = null;
function onDragStart(e: PointerEvent): void {
  dragStart = e.clientY;
}
function onDragEnd(e: PointerEvent): void {
  if (dragStart !== null && e.clientY - dragStart > 80) close();
  dragStart = null;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="gs">
      <div v-if="open" class="gs-root" :class="{ 'gs-root--phone': isPhone }">
        <div class="gs-scrim" data-testid="gs-scrim" @click="close" />
        <div
          ref="dialogEl"
          class="gs-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="t('search.dialog')"
          @keydown="onDialogKeydown"
        >
          <div v-if="isPhone" class="gs-grabber" aria-hidden="true" @pointerdown="onDragStart" @pointerup="onDragEnd" />

          <div v-if="!aiMode" class="gs-search" data-testid="gs-search">
            <div class="gs-field">
              <AppIcon name="search" class="gs-field-icon" aria-hidden="true" />
              <input
                ref="inputEl"
                v-model="search.term.value"
                class="gs-input"
                data-testid="gs-input"
                type="text"
                role="combobox"
                autocomplete="off"
                spellcheck="false"
                aria-expanded="true"
                :aria-controls="listboxId"
                :aria-activedescendant="activeId"
                :aria-label="t('search.dialog')"
                :placeholder="t('search.placeholder')"
                @keydown="onInputKeydown"
              />
              <button type="button" class="gs-close" :aria-label="t('search.close')" @click="close">
                <AppIcon name="close" aria-hidden="true" />
              </button>
            </div>

            <div :id="listboxId" class="gs-list" role="listbox" :aria-label="t('search.dialog')">
              <template v-for="section in sections" :key="section.group">
                <div v-if="section.title" class="gs-group" role="presentation">{{ section.title }}</div>
                <div
                  v-for="row in section.rows"
                  :id="row.id"
                  :key="row.key"
                  class="gs-option"
                  :class="{ 'gs-option--active': row.id === activeId }"
                  role="option"
                  :aria-selected="row.id === activeId ? 'true' : 'false'"
                  :data-testid="row.group === 'ai' ? 'gs-ai-entry' : `gs-option-${row.key}`"
                  @click="row.go()"
                  @mousemove="active = rows.indexOf(row)"
                >
                  <AppIcon :name="row.icon as never" class="gs-option-icon" aria-hidden="true" />
                  <span class="gs-option-label">{{ row.label }}</span>
                  <span v-if="row.sublabel" class="gs-option-sub">{{ row.sublabel }}</span>
                </div>
              </template>
            </div>

            <p v-if="statusKey" class="gs-status" data-testid="gs-status">{{ t(statusKey) }}</p>
            <p class="gs-sr" aria-live="polite">{{ liveText }}</p>
          </div>

          <div v-else class="gs-ai" data-testid="gs-ai-panel">
            <div class="gs-ai-head">
              <button type="button" class="gs-close" :aria-label="t('search.ai.back')" @click="backToSearch">
                <AppIcon name="arrow-left" aria-hidden="true" />
              </button>
              <span class="gs-ai-title">{{ t("search.ai.title") }}</span>
            </div>
            <textarea
              ref="aiEl"
              v-model="ai.question.value"
              class="gs-ai-question"
              data-testid="gs-ai-question"
              rows="3"
              :aria-label="t('search.ai.title')"
              @keydown="onAiKeydown"
            />
            <div class="gs-ai-bar">
              <span class="gs-ai-hint">{{ t("search.ai.hint") }}</span>
              <span v-if="aiLength >= COUNTER_FROM" class="gs-ai-counter" :class="{ 'gs-ai-counter--over': aiOver }">
                {{ t("search.ai.counter", { n: aiLength, max: MAX_AI_QUESTION_CHARS }) }}
              </span>
              <button type="button" class="gs-send" :disabled="!ai.canAsk.value" @click="ai.ask()">{{ t("search.ai.send") }}</button>
            </div>
            <p v-if="ai.loading.value" class="gs-status" role="status">{{ t("search.ai.thinking") }}</p>
            <p v-else-if="ai.errorKey.value" class="gs-status gs-status--error" role="alert" data-testid="gs-ai-error">{{ t(ai.errorKey.value) }}</p>
            <p v-else-if="ai.answer.value" class="gs-ai-answer" data-testid="gs-ai-answer">{{ ai.answer.value }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.gs-root {
  position: fixed;
  inset: 0;
  z-index: 2400;
}
.gs-scrim {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.32);
}
.gs-panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 100vw;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: -8px 0 32px rgb(0 0 0 / 0.16);
  overflow: hidden;
}
.gs-root--phone .gs-panel {
  top: auto;
  left: 0;
  width: 100%;
  height: 92dvh;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -8px 32px rgb(0 0 0 / 0.16);
}
.gs-grabber {
  align-self: center;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgb(var(--v-theme-on-surface) / 0.24);
  touch-action: none;
  flex: none;
}
.gs-search,
.gs-ai {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  flex: 1;
}
.gs-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}
.gs-field-icon {
  flex: none;
  width: 20px;
  height: 20px;
  opacity: 0.6;
}
.gs-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 16px;
}
.gs-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.gs-close:focus-visible,
.gs-send:focus-visible,
.gs-input:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.gs-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.gs-group {
  padding: 12px 8px 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}
.gs-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.gs-option--active {
  background: rgb(var(--v-theme-primary) / 0.12);
}
.gs-option-icon {
  flex: none;
  width: 20px;
  height: 20px;
}
.gs-option-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gs-option-sub {
  flex: none;
  font-size: 12px;
  opacity: 0.6;
}
.gs-status {
  margin: 0;
  padding: 8px;
  font-size: 14px;
  opacity: 0.8;
}
.gs-status--error {
  color: rgb(var(--v-theme-error));
  opacity: 1;
}
.gs-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.gs-ai-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gs-ai-title {
  font-weight: 600;
}
.gs-ai-question {
  width: 100%;
  resize: none;
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-on-surface) / 0.24);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 16px;
}
.gs-ai-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gs-ai-hint {
  flex: 1;
  font-size: 12px;
  opacity: 0.6;
}
.gs-ai-counter {
  font-size: 12px;
}
.gs-ai-counter--over {
  color: rgb(var(--v-theme-error));
}
.gs-send {
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font: inherit;
  cursor: pointer;
}
.gs-send:disabled {
  opacity: 0.4;
  cursor: default;
}
.gs-ai-answer {
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.5;
}

.gs-enter-active,
.gs-leave-active {
  transition: opacity 160ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gs-enter-active .gs-panel,
.gs-leave-active .gs-panel {
  transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.gs-enter-from,
.gs-leave-to {
  opacity: 0;
}
.gs-enter-from .gs-panel,
.gs-leave-to .gs-panel {
  transform: translateX(24px);
}
.gs-root--phone.gs-enter-from .gs-panel,
.gs-root--phone.gs-leave-to .gs-panel {
  transform: translateY(100%);
}
@media (prefers-reduced-motion: reduce) {
  .gs-enter-active,
  .gs-leave-active,
  .gs-enter-active .gs-panel,
  .gs-leave-active .gs-panel {
    transition: opacity 80ms linear;
  }
  .gs-enter-from .gs-panel,
  .gs-leave-to .gs-panel,
  .gs-root--phone.gs-enter-from .gs-panel,
  .gs-root--phone.gs-leave-to .gs-panel {
    transform: none;
  }
}
</style>
