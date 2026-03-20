<template>
  <div class="dashboard-charts">
    <section class="dashboard-charts__section">
      <h3 class="dashboard-charts__title">{{ t("rep.dashboard.chartPipelineTitle") }}</h3>
      <canvas ref="pipelineCanvas" class="dashboard-charts__canvas" />
    </section>

    <section class="dashboard-charts__section">
      <h3 class="dashboard-charts__title">{{ t("rep.dashboard.chartActivityTitle") }}</h3>
      <canvas ref="activityCanvas" class="dashboard-charts__canvas" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip,
         LineController, LineElement, PointElement, Filler, Legend } from "chart.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip,
               LineController, LineElement, PointElement, Filler, Legend);

const { t } = useI18n();

const PRIMARY        = "#128F83";
const PRIMARY_LIGHT  = "#8ED6CE";
const PIPELINE_COLORS = ["#4CAF50", "#128F83", "#F59E0B", "#FB923C", "#6366F1"];

const pipelineCanvas = ref<HTMLCanvasElement>();
const activityCanvas = ref<HTMLCanvasElement>();
let pipelineChart: Chart | null = null;
let activityChart: Chart | null = null;

onMounted(() => {
  if (pipelineCanvas.value) {
    pipelineChart = new Chart(pipelineCanvas.value, {
      type: "bar",
      data: {
        labels: [
          t("rep.dashboard.pipelineNew"),
          t("rep.dashboard.pipelineContacted"),
          t("rep.dashboard.pipelineQualified"),
          t("rep.dashboard.pipelineAccepted"),
          t("rep.dashboard.pipelineCompleted"),
        ],
        datasets: [{
          data: [24, 8, 5, 3, 12],
          backgroundColor: PIPELINE_COLORS,
          borderRadius: 5,
          barThickness: 20,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: "index" } },
        scales: {
          x: { grid: { color: "#e0e0e0" }, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12, weight: "bold" } } },
        },
      },
    });
  }

  if (activityCanvas.value) {
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - 5 + i);
      return new Intl.DateTimeFormat(undefined, { month: "short" }).format(d);
    });

    activityChart = new Chart(activityCanvas.value, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: t("rep.dashboard.chartPlanned"),
            data: [8, 14, 11, 16, 18, 12],
            borderColor: PRIMARY,
            backgroundColor: PRIMARY + "22",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            borderWidth: 2,
          },
          {
            label: t("rep.dashboard.chartCompleted"),
            data: [7, 12, 9, 15, 17, 10],
            borderColor: PRIMARY_LIGHT,
            backgroundColor: PRIMARY_LIGHT + "22",
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { font: { size: 12 } } }, tooltip: { mode: "index" } },
        scales: {
          x: { grid: { color: "#e0e0e0" }, ticks: { font: { size: 11 } } },
          y: { grid: { color: "#e0e0e0" }, ticks: { font: { size: 11 } } },
        },
      },
    });
  }
});

onUnmounted(() => {
  pipelineChart?.destroy();
  activityChart?.destroy();
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

.dashboard-charts__canvas {
  height: 220px;
}
</style>
