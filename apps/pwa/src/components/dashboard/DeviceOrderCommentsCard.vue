<template>
  <section class="order-comments" :aria-labelledby="headingId" data-testid="device-order-comments-card">
    <h2 :id="headingId" class="order-comments__title">
      <AppIcon name="message" class="order-comments__title-icon" />
      {{ t("app.deviceOrder.recentComments.title") }}
    </h2>

    <AppLoadingState v-if="loading && !loaded" />
    <AppErrorState
      v-else-if="loadFailure"
      :error="loadFailure"
      :subtitle="t('app.deviceOrder.recentComments.errorLoad')"
      :refresh-label="t('app.errorState.refresh')"
      :loading="loading"
      @refresh="load"
    />
    <AppEmptyState v-else-if="items.length === 0" :title="t('app.deviceOrder.recentComments.empty')" />
    <ul v-else class="order-comments__list">
      <li v-for="item in items" :key="item.id">
        <!-- Opens the patient's Dispositivo tab with this order's comments panel. -->
        <RouterLink
          class="order-comments__item"
          :to="{ name: 'patient-detail', params: { id: item.patient_id }, query: { tab: 'orthoapnea', comments: item.treatment_plan_id } }"
          data-testid="device-order-comment"
        >
          <span class="order-comments__head">
            <strong class="order-comments__patient">{{ item.patient_name }}</strong>
            <span v-if="item.order_number" class="order-comments__order">{{ t("app.deviceOrder.recentComments.order", { n: item.order_number }) }}</span>
            <time class="order-comments__time" :datetime="item.created_at">{{ formatDateTime(item.created_at) }}</time>
          </span>
          <span class="order-comments__body">{{ item.body }}</span>
          <span v-if="item.author_name" class="order-comments__author">{{ item.author_name }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { intlLocale } from "@i18n/language-options";
import { onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import AppEmptyState from "../AppEmptyState.vue";
import AppErrorState from "../AppErrorState.vue";
import AppIcon from "../AppIcon.vue";
import AppLoadingState from "../AppLoadingState.vue";
import { apiFetch } from "../../composables/useApi";

/** NEO-217: the admin's overview of the latest comments on device orders, across all patients. */
interface DeviceOrderComment {
  id: string;
  treatment_plan_id: string;
  patient_id: string;
  patient_name: string | null;
  order_number: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

const LIMIT = 10;

const { t, locale } = useI18n();
const headingId = useId();
const items = ref<DeviceOrderComment[]>([]);
const loading = ref(false);
const loaded = ref(false);
const loadFailure = ref<unknown>(null);

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(intlLocale(locale.value), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function load() {
  loading.value = true;
  loadFailure.value = null;
  try {
    const res = await apiFetch(`/api/v1/note/device-orders/recent?limit=${LIMIT}`, { handleErrors: false });
    if (res.ok) items.value = ((await res.json()) as { items: DeviceOrderComment[] }).items;
    else loadFailure.value = await reportFailedResponse(res, { where: "DeviceOrderCommentsCard.load" });
  } catch (err) {
    reportCaught(err, { where: "DeviceOrderCommentsCard.load" });
    loadFailure.value = err;
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

onMounted(load);
</script>

<style scoped>
.order-comments {
  max-width: 720px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  padding: 16px;
  background: rgb(var(--v-theme-surface));
}
.order-comments__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.order-comments__title-icon {
  width: 18px;
  height: 18px;
}
.order-comments__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.order-comments__list li + li {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.order-comments__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  margin: 0 -8px;
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}
.order-comments__item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.order-comments__item:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}
.order-comments__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.order-comments__patient {
  font-weight: 600;
  font-size: 0.9375rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-comments__order {
  flex: none;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.order-comments__time {
  flex: none;
  margin-left: auto;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-variant-numeric: tabular-nums;
}
.order-comments__body {
  font-size: 0.875rem;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.order-comments__author {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
