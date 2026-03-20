<template>
  <div class="dashboard-charts">
    <section class="dashboard-charts__section">
      <h3 class="dashboard-charts__title">{{ t("rep.dashboard.chartPipelineTitle") }}</h3>
      <VueApexCharts type="bar" :options="pipelineOptions" :series="pipelineSeries" height="220" />
    </section>

    <section class="dashboard-charts__section">
      <h3 class="dashboard-charts__title">{{ t("rep.dashboard.chartActivityTitle") }}</h3>
      <VueApexCharts type="area" :options="activityOptions" :series="activitySeries" height="220" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import VueApexCharts from "vue3-apexcharts";

const { t } = useI18n();

const PRIMARY = "#128F83";
const PRIMARY_LIGHT = "#8ED6CE";
const GREY = "#e0e0e0";
const PIPELINE_COLORS = ["#4CAF50", "#128F83", "#F59E0B", "#FB923C", "#6366F1"];

const pipelineSeries = [{ name: "Leads", data: [24, 3, 5, 8, 12] }];

const pipelineOptions = computed(() => ({
  chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit" },
  plotOptions: { bar: { horizontal: true, borderRadius: 5, barHeight: "58%", distributed: true } },
  colors: PIPELINE_COLORS,
  legend: { show: false },
  dataLabels: { enabled: true, style: { fontSize: "12px", colors: ["#fff"] }, dropShadow: { enabled: false } },
  xaxis: {
    categories: [
      t("rep.dashboard.pipelineCompleted"),
      t("rep.dashboard.pipelineAccepted"),
      t("rep.dashboard.pipelineQualified"),
      t("rep.dashboard.pipelineContacted"),
      t("rep.dashboard.pipelineNew"),
    ],
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

const activityOptions = computed(() => {
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5 + i);
    return new Intl.DateTimeFormat(undefined, { month: "short" }).format(d);
  });
  return {
    chart: { type: "area", toolbar: { show: false }, fontFamily: "inherit" },
    colors: [PRIMARY, PRIMARY_LIGHT],
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
    },
    stroke: { curve: "smooth", width: 2 },
    dataLabels: { enabled: false },
    xaxis: { categories: months, labels: { style: { fontSize: "11px" } } },
    yaxis: { labels: { style: { fontSize: "11px" } } },
    legend: { position: "top", fontSize: "12px" },
    grid: { borderColor: GREY, strokeDashArray: 4 },
    tooltip: { theme: "light" },
  };
});
</script>

<style scoped>
.dashboard-charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
}

.dashboard-charts__section {
  min-width: 0;
}

.dashboard-charts__title {
  margin: 0 0 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}
</style>
