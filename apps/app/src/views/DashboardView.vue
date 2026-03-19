<template>
  <div class="view-dashboard">

    <!-- Upcoming Meetings -->
    <section class="view-dashboard__section">
      <div class="view-dashboard__section-header">
        <h3 class="view-dashboard__section-title">{{ t("rep.dashboard.upcomingTitle") }}</h3>
        <RouterLink to="/planner" class="view-dashboard__section-link">
          {{ t("rep.dashboard.upcomingViewAll") }} →
        </RouterLink>
      </div>

      <div v-if="loadingMeetings" class="view-dashboard__meetings-loading">
        <VProgressCircular indeterminate size="20" width="2" color="primary" />
      </div>

      <p v-else-if="upcomingMeetings.length === 0" class="view-dashboard__meetings-empty">
        {{ t("rep.dashboard.upcomingEmpty") }}
      </p>

      <ul v-else class="view-dashboard__meetings-list">
        <li
          v-for="ev in upcomingMeetings"
          :key="ev.id"
          class="view-dashboard__meeting-item"
        >
          <RouterLink to="/planner" class="view-dashboard__meeting-tile" :class="ev.type === 'video' ? 'view-dashboard__meeting-tile--video' : 'view-dashboard__meeting-tile--f2f'">
            <div class="view-dashboard__meeting-tile-row">
              <svg v-if="ev.type === 'video'" class="view-dashboard__meeting-tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
              <svg v-else class="view-dashboard__meeting-tile-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="view-dashboard__meeting-tile-when">{{ formatMeetingDate(ev.start_at) }}</span>
            </div>
            <p class="view-dashboard__meeting-tile-name">{{ ev.title }}</p>
            <span class="view-dashboard__meeting-tile-label" :class="ev.type === 'video' ? 'view-dashboard__meeting-tile-label--video' : 'view-dashboard__meeting-tile-label--f2f'">
              {{ ev.type === "video" ? "Video call" : "Face to face" }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <div class="view-dashboard__divider" />

    <!-- Charts row -->
    <div class="view-dashboard__charts">

      <!-- Chart 1: Lead Pipeline -->
      <section class="view-dashboard__chart-section">
        <h3 class="view-dashboard__section-title">{{ t("rep.dashboard.chartPipelineTitle") }}</h3>
        <VueApexCharts
          type="bar"
          :options="pipelineOptions"
          :series="pipelineSeries"
          height="220"
        />
      </section>

      <!-- Chart 2: Monthly Visits -->
      <section class="view-dashboard__chart-section">
        <h3 class="view-dashboard__section-title">{{ t("rep.dashboard.chartActivityTitle") }}</h3>
        <VueApexCharts
          type="area"
          :options="activityOptions"
          :series="activitySeries"
          height="220"
        />
      </section>

    </div>

    <VBtn
      v-if="isDev"
      variant="text"
      color="primary"
      :to="{ path: '/dev' }"
      size="small"
      class="mt-4"
    >
      {{ t("rep.dev.linkToDevTools") }}
    </VBtn>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import VueApexCharts from "vue3-apexcharts";
import { apiFetch } from "../utils/api";

interface ApiEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: string;
  status: string;
}

const { t } = useI18n();
const isDev = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Upcoming meetings
// ---------------------------------------------------------------------------
const upcomingMeetings = ref<ApiEvent[]>([]);
const loadingMeetings = ref(true);

function getUpcomingRange(): { start: string; end: string } {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchUpcomingMeetings() {
  loadingMeetings.value = true;
  try {
    const { start, end } = getUpcomingRange();
    const res = await apiFetch(
      `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { handleErrors: false }
    );
    if (res.ok) {
      const json = (await res.json()) as { items?: ApiEvent[] };
      upcomingMeetings.value = (json.items ?? [])
        .filter((e) => e.status === "scheduled")
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
        .slice(0, 4);
    }
  } finally {
    loadingMeetings.value = false;
  }
}

function formatMeetingDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart.getTime() + 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d >= todayStart && d < tomorrowStart) return `Today ${time}`;
  if (d >= tomorrowStart && d < new Date(tomorrowStart.getTime() + 86400000)) return `Tomorrow ${time}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
}

// ---------------------------------------------------------------------------
// Charts – demo data (realistic for a pharma sales territory)
// ---------------------------------------------------------------------------
const PRIMARY = "#128F83";
const PRIMARY_LIGHT = "#8ED6CE";
const GREY = "#e0e0e0";

const PIPELINE_COLORS = ["#4CAF50", "#128F83", "#F59E0B", "#FB923C", "#6366F1"];

const pipelineSeries = [{ name: "Leads", data: [24, 3, 5, 8, 12] }];

const pipelineOptions = computed(() => ({
  chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
  plotOptions: {
    bar: { horizontal: true, borderRadius: 5, barHeight: "58%", distributed: true },
  },
  colors: PIPELINE_COLORS,
  legend: { show: false },
  dataLabels: { enabled: true, style: { fontSize: "12px", colors: ["#fff"] }, dropShadow: { enabled: false } },
  xaxis: {
    categories: ["Completed", "Accepted", "Qualified", "Contacted", "New"],
    labels: { style: { fontSize: "12px" } },
  },
  yaxis: { labels: { style: { fontSize: "12px", fontWeight: 500 } } },
  grid: { borderColor: GREY, strokeDashArray: 4 },
  tooltip: { theme: "light" },
}));

const activitySeries = computed(() => [
  { name: t("rep.dashboard.chartPlanned"), data: [8, 14, 11, 16, 18, 12] },
  { name: t("rep.dashboard.chartCompleted"), data: [7, 12, 9, 15, 17, 10] },
]);

const activityOptions = computed(() => ({
  chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
  colors: [PRIMARY, PRIMARY_LIGHT],
  fill: {
    type: "gradient",
    gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
  },
  stroke: { curve: "smooth", width: 2 },
  dataLabels: { enabled: false },
  xaxis: {
    categories: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
    labels: { style: { fontSize: "11px" } },
  },
  yaxis: { labels: { style: { fontSize: "11px" } } },
  legend: { position: "top", fontSize: "12px" },
  grid: { borderColor: GREY, strokeDashArray: 4 },
  tooltip: { theme: "light" },
}));

onMounted(fetchUpcomingMeetings);
</script>

<style lang="scss" scoped>
.view-dashboard {
  max-width: 100%;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
.view-dashboard__section {
  padding: 0 4px;
}

.view-dashboard__section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}

.view-dashboard__section-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.view-dashboard__section-link {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;

  &:hover { text-decoration: underline; }
}

// ---------------------------------------------------------------------------
// Meetings list
// ---------------------------------------------------------------------------
.view-dashboard__meetings-loading {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}

.view-dashboard__meetings-empty {
  margin: 0;
  padding: 12px 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-dashboard__meetings-list {
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

.view-dashboard__meeting-item {
  min-width: 0;
}

.view-dashboard__meeting-tile {
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
  box-shadow: none;
  transition: box-shadow 0.15s, transform 0.12s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  &--f2f {
    border-left-color: #128F83;
    .view-dashboard__meeting-tile-when { color: #128F83; }
  }

  &--video {
    border-left-color: #F59E0B;
    .view-dashboard__meeting-tile-when { color: #b45309; }
  }
}

.view-dashboard__meeting-tile-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-dashboard__meeting-tile-icon {
  flex-shrink: 0;
  width: 15px;
  height: 15px;

  .view-dashboard__meeting-tile--f2f & { color: #128F83; }
  .view-dashboard__meeting-tile--video & { color: #b45309; }
}

.view-dashboard__meeting-tile-name {
  align-self: stretch;
}

.view-dashboard__meeting-tile-when {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.view-dashboard__meeting-tile-name {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-dashboard__meeting-tile-label {
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

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------
.view-dashboard__divider {
  height: 1px;
  background: rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 20px 4px;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
.view-dashboard__charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 0 4px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
}

.view-dashboard__chart-section {
  min-width: 0;
}
</style>
