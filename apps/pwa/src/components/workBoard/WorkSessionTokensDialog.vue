<template>
  <AppFormDialog
    :model-value="open"
    :title="t('workBoard.tokens.title')"
    max-width="560"
    @update:model-value="(v: boolean) => !v && emit('close')"
    @close="emit('close')"
    @after-leave="plaintext = null"
  >
    <div class="work-tokens" data-testid="work-tokens-dialog">
      <p class="work-tokens__hint">{{ t("workBoard.tokens.hint") }}</p>

      <form class="work-tokens__new" @submit.prevent="issue">
        <VTextField
          v-model="name"
          :label="t('workBoard.tokens.name')"
          variant="outlined"
          density="comfortable"
          hide-details
          maxlength="60"
          data-testid="work-token-name"
        />
        <AppButton type="submit" color="primary" variant="flat" :loading="issuing" :disabled="!name.trim()" data-testid="work-token-create">
          {{ t("workBoard.tokens.create") }}
        </AppButton>
      </form>

      <div v-if="plaintext" class="work-tokens__once" data-testid="work-token-plaintext">
        <p class="work-tokens__once-hint">{{ t("workBoard.tokens.shownOnce") }}</p>
        <code class="work-tokens__code">{{ plaintext }}</code>
        <AppButton variant="text" size="small" @click="copy">{{ copied ? t("workBoard.tokens.copied") : t("workBoard.tokens.copy") }}</AppButton>
      </div>

      <AppSkeletonLines v-if="loading && !tokens.length" :lines="2" />
      <AppErrorState v-else-if="failure" :error="failure" :refresh-label="t('app.errorState.refresh')" @refresh="load" />
      <p v-else-if="!tokens.length" class="work-tokens__empty">{{ t("workBoard.tokens.empty") }}</p>
      <template v-else>
        <template v-if="active.length">
          <h3 class="work-tokens__label">{{ t("workBoard.tokens.active", { n: active.length }) }}</h3>
          <ul class="work-tokens__list" data-testid="work-tokens-active">
            <li v-for="token in active" :key="token.id" class="work-tokens__row">
              <VIcon class="work-tokens__icon" icon="mdi-key-variant" size="18" />
              <div class="work-tokens__meta">
                <span class="work-tokens__name">{{ token.name }}</span>
                <span class="work-tokens__used">{{ usedLabel(token) }}</span>
              </div>
              <AppButton variant="text" size="small" color="error" :data-testid="`work-token-revoke-${token.id}`" @click="revoke(token)">
                {{ t("workBoard.tokens.revoke") }}
              </AppButton>
            </li>
          </ul>
        </template>
        <!-- Revoked tokens are history, not choices (CORE-196 D2): folded away so the live ones stay in focus. -->
        <template v-if="revoked.length">
          <AppButton
            class="work-tokens__toggle"
            variant="text"
            size="small"
            :append-icon="showRevoked ? 'mdi-chevron-up' : 'mdi-chevron-down'"
            :aria-expanded="showRevoked"
            data-testid="work-tokens-revoked-toggle"
            @click="showRevoked = !showRevoked"
          >
            {{ t("workBoard.tokens.revokedGroup", { n: revoked.length }) }}
          </AppButton>
          <ul
            v-if="showRevoked"
            class="work-tokens__list work-tokens__list--revoked"
            :aria-label="t('workBoard.tokens.revoked')"
            data-testid="work-tokens-revoked"
          >
            <li v-for="token in revoked" :key="token.id" class="work-tokens__row">
              <VIcon class="work-tokens__icon" icon="mdi-key-remove" size="18" />
              <div class="work-tokens__meta">
                <span class="work-tokens__name">{{ token.name }}</span>
                <span class="work-tokens__used">{{ usedLabel(token) }}</span>
              </div>
            </li>
          </ul>
        </template>
      </template>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppSkeletonLines from "../AppSkeletonLines.vue";
import AppErrorState from "../AppErrorState.vue";
import { fetchSessionTokens, issueSessionToken, revokeSessionToken } from "../../composables/useWorkBoard";
import { formatRelativeTime } from "../../utils/relativeTime";
import type { WorkSessionToken } from "../../types/workBoard";

/**
 * Session tokens for Claude Code (CORE-187, decision core187-r1 Q1): one per device. A new
 * token's plaintext is shown here once; the API keeps only its SHA-256. Revoking is immediate.
 */
const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();

const tokens = ref<WorkSessionToken[]>([]);
const loading = ref(false);
const failure = ref<unknown>(null);
const name = ref("");
const issuing = ref(false);
const plaintext = ref<string | null>(null);
const copied = ref(false);
const showRevoked = ref(false);
const active = computed(() => tokens.value.filter((x) => !x.revoked_at));
const revoked = computed(() => tokens.value.filter((x) => x.revoked_at));

async function load(): Promise<void> {
  loading.value = true;
  failure.value = null;
  try {
    tokens.value = await fetchSessionTokens();
  } catch (err) {
    failure.value = err;
  } finally {
    loading.value = false;
  }
}

async function issue(): Promise<void> {
  if (!name.value.trim() || issuing.value) return;
  issuing.value = true;
  try {
    const { item, token } = await issueSessionToken(name.value.trim());
    plaintext.value = token;
    copied.value = false;
    tokens.value = [item, ...tokens.value];
    name.value = "";
  } catch {
    // benign: the composable already reported it; the form stays filled for a retry
  } finally {
    issuing.value = false;
  }
}

async function revoke(token: WorkSessionToken): Promise<void> {
  try {
    await revokeSessionToken(token.id);
    tokens.value = tokens.value.map((x) => (x.id === token.id ? { ...x, revoked_at: new Date().toISOString() } : x));
  } catch {
    // benign: the composable already reported it
  }
}

async function copy(): Promise<void> {
  if (!plaintext.value) return;
  try {
    await navigator.clipboard.writeText(plaintext.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

function usedLabel(token: WorkSessionToken): string {
  return token.last_used_at
    ? t("workBoard.tokens.lastUsed", { when: formatRelativeTime(token.last_used_at, locale.value) })
    : t("workBoard.tokens.neverUsed");
}

// The one-time plaintext goes after the leave (CORE-195), so the dialog doesn't redraw while it fades;
// the list refreshes under the rows already shown.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    plaintext.value = null;
    showRevoked.value = false;
    void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.work-tokens {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.work-tokens__hint,
.work-tokens__empty,
.work-tokens__used {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

.work-tokens__new {
  display: flex;
  gap: 8px;
  align-items: center;
}

.work-tokens__once {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.08);
}

.work-tokens__once-hint {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.work-tokens__code {
  word-break: break-all;
  font-size: 0.8125rem;
}

/* The field (comfortable, 48px) and the filled button share one row height. */
.work-tokens__new :deep(.v-btn) {
  height: 48px;
}

.work-tokens__label {
  margin: 0 0 -8px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* One grouped card with hairlines between rows, instead of loose text lines. */
.work-tokens__list {
  margin: 0;
  padding: 0;
  list-style: none;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  overflow: hidden;
}

.work-tokens__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 8px 8px 8px 16px;
}

.work-tokens__row + .work-tokens__row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.work-tokens__icon {
  flex: none;
  color: rgb(var(--v-theme-primary));
}

.work-tokens__list--revoked .work-tokens__icon,
.work-tokens__list--revoked .work-tokens__name {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-tokens__toggle {
  align-self: flex-start;
  /* The label, not the button's padding, lines up with the 24dp content edge. */
  margin-left: -12px;
}

.work-tokens__meta {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.work-tokens__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
