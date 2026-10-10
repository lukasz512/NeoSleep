<template>
  <AppFormDialog
    :model-value="open"
    :title="t('workBoard.tokens.title')"
    max-width="560"
    @update:model-value="(v: boolean) => !v && emit('close')"
    @close="emit('close')"
  >
    <div class="work-tokens" data-testid="work-tokens-dialog">
      <p class="work-tokens__hint">{{ t("workBoard.tokens.hint") }}</p>

      <form class="work-tokens__new" @submit.prevent="issue">
        <VTextField
          v-model="name"
          :label="t('workBoard.tokens.name')"
          variant="outlined"
          density="compact"
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

      <AppLoadingState v-if="loading" />
      <AppErrorState v-else-if="failure" :error="failure" :refresh-label="t('app.errorState.refresh')" @refresh="load" />
      <p v-else-if="!tokens.length" class="work-tokens__empty">{{ t("workBoard.tokens.empty") }}</p>
      <ul v-else class="work-tokens__list">
        <li v-for="token in tokens" :key="token.id" class="work-tokens__row" :class="{ 'work-tokens__row--revoked': token.revoked_at }">
          <div class="work-tokens__meta">
            <span class="work-tokens__name">{{ token.name }}</span>
            <span class="work-tokens__used">{{ usedLabel(token) }}</span>
          </div>
          <span v-if="token.revoked_at" class="work-tokens__state">{{ t("workBoard.tokens.revoked") }}</span>
          <AppButton v-else variant="text" size="small" color="error" :data-testid="`work-token-revoke-${token.id}`" @click="revoke(token)">
            {{ t("workBoard.tokens.revoke") }}
          </AppButton>
        </li>
      </ul>
    </div>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import AppLoadingState from "../AppLoadingState.vue";
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

watch(
  () => props.open,
  (open) => {
    plaintext.value = null;
    if (open) void load();
  },
  { immediate: true },
);
</script>

<style scoped>
.work-tokens {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.work-tokens__hint,
.work-tokens__empty,
.work-tokens__used,
.work-tokens__state {
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

.work-tokens__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.work-tokens__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
}

.work-tokens__row--revoked .work-tokens__name {
  text-decoration: line-through;
  opacity: 0.6;
}

.work-tokens__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.work-tokens__name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
