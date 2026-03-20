<template>
  <section class="upcoming-meetings">
    <div class="upcoming-meetings__header">
      <h3 class="upcoming-meetings__title">{{ t("rep.dashboard.upcomingTitle") }}</h3>
      <RouterLink to="/planner" class="upcoming-meetings__link">
        {{ t("rep.dashboard.upcomingViewAll") }} →
      </RouterLink>
    </div>

    <div v-if="loading" class="upcoming-meetings__loading">
      <VProgressCircular indeterminate size="20" width="2" color="primary" />
    </div>

    <p v-else-if="meetings.length === 0" class="upcoming-meetings__empty">
      {{ t("rep.dashboard.upcomingEmpty") }}
    </p>

    <ul v-else class="upcoming-meetings__list">
      <li v-for="ev in meetings" :key="ev.id" class="upcoming-meetings__item">
        <RouterLink
          to="/planner"
          class="upcoming-meetings__tile"
          :class="ev.type === 'video' ? 'upcoming-meetings__tile--video' : 'upcoming-meetings__tile--f2f'"
        >
          <div class="upcoming-meetings__tile-row">
            <AppIcon
              :name="ev.type === 'video' ? 'video-camera' : 'users-group'"
              class="upcoming-meetings__tile-icon"
            />
            <span class="upcoming-meetings__tile-when">{{ formatDate(ev.start_at) }}</span>
          </div>
          <p class="upcoming-meetings__tile-name">{{ ev.title }}</p>
          <span
            class="upcoming-meetings__tile-label"
            :class="ev.type === 'video' ? 'upcoming-meetings__tile-label--video' : 'upcoming-meetings__tile-label--f2f'"
          >
            {{ ev.type === "video" ? t("rep.planner.form.typeVideo") : t("rep.planner.form.typeF2f") }}
          </span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../utils/api";
import AppIcon from "./AppIcon.vue";

interface ApiEvent {
  id: string;
  title: string;
  start_at: string;
  type: string;
  status: string;
}

const { t } = useI18n();
const meetings = ref<ApiEvent[]>([]);
const loading = ref(true);

async function fetchMeetings() {
  loading.value = true;
  try {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const res = await apiFetch(
      `/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`,
      { handleErrors: false }
    );
    if (res.ok) {
      const json = (await res.json()) as { items?: ApiEvent[] };
      meetings.value = (json.items ?? [])
        .filter((e) => e.status === "scheduled")
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 4);
    }
  } finally {
    loading.value = false;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d >= todayStart && d < tomorrowStart) return `${t("rep.dashboard.dateToday")} ${time}`;
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86400000))
    return `${t("rep.dashboard.dateTomorrow")} ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
}

onMounted(fetchMeetings);
</script>

<style scoped>
.upcoming-meetings__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.upcoming-meetings__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.upcoming-meetings__link {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;

  &:hover { text-decoration: underline; }
}

.upcoming-meetings__loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.upcoming-meetings__empty {
  margin: 0;
  padding: 12px 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.upcoming-meetings__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  @media (min-width: 900px) {
    grid-template-columns: repeat(4, 1fr);
  }
}

.upcoming-meetings__item {
  min-width: 0;
}

.upcoming-meetings__tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-left: 3px solid transparent;
  background: var(--rep-bg, #fff);
  transition: box-shadow 0.15s, transform 0.12s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &--f2f {
    border-left-color: #128F83;
    .upcoming-meetings__tile-when { color: #128F83; }
  }

  &--video {
    border-left-color: #F59E0B;
    .upcoming-meetings__tile-when { color: #b45309; }
  }
}

.upcoming-meetings__tile-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.upcoming-meetings__tile-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;

  .upcoming-meetings__tile--f2f & { color: #128F83; }
  .upcoming-meetings__tile--video & { color: #b45309; }
}

.upcoming-meetings__tile-when {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.upcoming-meetings__tile-name {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  align-self: stretch;
}

.upcoming-meetings__tile-label {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;

  &--f2f {
    background: rgba(18, 143, 131, 0.1);
    color: #128F83;
  }

  &--video {
    background: rgba(245, 158, 11, 0.12);
    color: #b45309;
  }
}
</style>
