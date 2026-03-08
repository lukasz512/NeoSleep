<template>
  <div class="view-dashboard">
    <VCard class="view-dashboard__today-card" variant="outlined">
      <VCardTitle class="view-dashboard__today-title">
        <span class="view-dashboard__today-icon" aria-hidden="true">☀️</span>
        {{ t("rep.dashboard.todayTitle") }}
      </VCardTitle>
      <VCardText class="view-dashboard__today-body">
        <div v-if="loadingToday" class="view-dashboard__today-loading">
          <VProgressCircular indeterminate size="24" width="2" />
        </div>
        <template v-else>
          <div v-if="todayEvents.length > 0" class="view-dashboard__today-events">
            <p class="view-dashboard__today-subtitle">{{ t("rep.dashboard.todayEvents", { count: todayEvents.length }) }}</p>
            <ul class="view-dashboard__today-list">
              <li
                v-for="ev in todayEvents"
                :key="ev.id"
                class="view-dashboard__today-item"
              >
                <RouterLink :to="{ path: '/planner' }" class="view-dashboard__today-link">
                  <span class="view-dashboard__today-time">{{ formatTime(ev.start_at) }}</span>
                  <span class="view-dashboard__today-event-title">{{ ev.title || t("rep.planner.form.fieldTitle") }}</span>
                </RouterLink>
              </li>
            </ul>
          </div>
          <div v-else class="view-dashboard__today-empty">
            <p class="view-dashboard__today-subtitle">{{ t("rep.dashboard.todayNoEvents") }}</p>
            <p class="view-dashboard__today-hint">{{ t("rep.dashboard.todayHint") }}</p>
          </div>
          <div class="view-dashboard__today-focus">
            <p class="view-dashboard__today-focus-title">{{ t("rep.dashboard.todayFocus") }}</p>
            <ul class="view-dashboard__today-checklist">
              <li class="view-dashboard__today-check-item">
                <RouterLink :to="{ path: '/planner' }" class="view-dashboard__today-check-link">
                  {{ t("rep.dashboard.todayCheck1") }}
                </RouterLink>
              </li>
              <li class="view-dashboard__today-check-item">
                <RouterLink :to="{ path: '/leads' }" class="view-dashboard__today-check-link">
                  {{ t("rep.dashboard.todayCheck2") }}
                </RouterLink>
              </li>
              <li class="view-dashboard__today-check-item">
                <RouterLink :to="{ path: '/hcp' }" class="view-dashboard__today-check-link">
                  {{ t("rep.dashboard.todayCheck3") }}
                </RouterLink>
              </li>
            </ul>
          </div>
        </template>
      </VCardText>
    </VCard>

    <VCard v-if="isDev" class="view-dashboard__dev-link mt-4" variant="outlined">
      <VCardText class="py-2">
        <VBtn variant="text" color="primary" :to="{ path: '/dev' }" block>
          {{ t("rep.dev.linkToDevTools") }}
        </VBtn>
      </VCardText>
    </VCard>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { bffFetch } from "../composables/useBffApi";
import { useAuthStore } from "../stores/auth";

interface ApiEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: string;
  status: string;
}

const { t } = useI18n();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");
const isDev = import.meta.env.DEV;

const todayEvents = ref<ApiEvent[]>([]);
const loadingToday = ref(true);

function getTodayRange(): { start: string; end: string } {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchTodayEvents() {
  loadingToday.value = true;
  try {
    const { start, end } = getTodayRange();
    const res = await bffFetch(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      handleErrors: false,
    });
    if (res.ok) {
      const json = (await res.json()) as { items?: ApiEvent[] };
      const items = json.items ?? [];
      todayEvents.value = items
        .filter((e) => e.status !== "cancelled")
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
  } finally {
    loadingToday.value = false;
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

onMounted(fetchTodayEvents);
</script>

<style lang="scss" scoped>
.view-dashboard {
  max-width: 100%;
  padding: 16px 0;
}

.view-dashboard__today-card {
  border-radius: var(--rep-radius);
  overflow: hidden;
}

.view-dashboard__today-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.125rem;
  font-weight: 600;
  padding: 16px 20px;
}

.view-dashboard__today-icon {
  font-size: 1.25rem;
}

.view-dashboard__today-body {
  padding: 0 20px 20px;
}

.view-dashboard__today-loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.view-dashboard__today-subtitle {
  margin: 0 0 12px 0;
  font-size: 0.9375rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-dashboard__today-events {
  margin-bottom: 20px;
}

.view-dashboard__today-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.view-dashboard__today-item {
  margin-bottom: 8px;

  &:last-child {
    margin-bottom: 0;
  }
}

.view-dashboard__today-link {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--rep-radius);
  text-decoration: none;
  color: inherit;
  transition: background-color 0.2s ease;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
}

.view-dashboard__today-time {
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  min-width: 48px;
}

.view-dashboard__today-event-title {
  font-size: 0.9375rem;
}

.view-dashboard__today-empty {
  margin-bottom: 20px;
}

.view-dashboard__today-hint {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-dashboard__today-focus {
  padding-top: 16px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.view-dashboard__today-focus-title {
  margin: 0 0 12px 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-dashboard__today-checklist {
  margin: 0;
  padding: 0;
  list-style: none;
}

.view-dashboard__today-check-item {
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }
}

.view-dashboard__today-check-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 0.9375rem;
  text-decoration: none;
  color: rgb(var(--v-theme-primary));
  transition: opacity 0.2s ease;

  &::before {
    content: "☐";
    font-size: 1rem;
    opacity: 0.6;
  }

  &:hover {
    opacity: 0.85;
    text-decoration: underline;
  }
}

.view-dashboard__dev-link {
  max-width: 320px;
}
</style>
