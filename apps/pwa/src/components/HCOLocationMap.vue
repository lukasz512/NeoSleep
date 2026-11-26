<template>
  <div
    ref="mapContainer"
    class="hco-location-map"
    :class="{ 'hco-location-map--loading': loading, 'hco-location-map--error': error }"
  >
    <p v-if="error" class="hco-location-map__error">{{ t("user.hco.detail.mapUnavailable") }}</p>
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { loadGoogleMaps, googleMapId } from "../composables/useGoogleMaps";

/** Single-pin map for one organization's address — HCODetailView's Details
 *  tab. See apps/web/src/composables/useSpecialistMap.ts for the multi-pin,
 *  clickable-marker version this is a simplified sibling of (no bounds
 *  fitting or clustering needed for just one, already-on-screen location). */
const props = defineProps<{
  latitude: number;
  longitude: number;
  name: string;
}>();

const { t } = useI18n();

const mapContainer = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref(false);
let map: google.maps.Map | null = null;
let marker: google.maps.marker.AdvancedMarkerElement | null = null;

async function render() {
  if (!mapContainer.value) return;
  loading.value = true;
  error.value = false;
  try {
    const libs = await loadGoogleMaps();
    const position = { lat: props.latitude, lng: props.longitude };
    if (!map) {
      map = new libs.Map(mapContainer.value, {
        mapId: googleMapId(),
        center: position,
        zoom: 15,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControl: true,
      });
    } else {
      map.setCenter(position);
    }
    if (marker) marker.map = null;
    marker = new libs.AdvancedMarkerElement({ position, map, title: props.name });
  } catch (err) {
    reportCaught(err, { where: "HCOLocationMap.render", level: "warn" });
    map = null;
    error.value = true;
    // Blank used to be the whole error state — the address text above still
    // has the full information — but a silent failure is indistinguishable
    // from "no map here", so it now says so explicitly (CORE-43).
  } finally {
    loading.value = false;
  }
}

onMounted(render);
watch(() => [props.latitude, props.longitude], render);
onBeforeUnmount(() => {
  if (marker) marker.map = null;
  map = null;
});
</script>

<style scoped>
.hco-location-map {
  margin-top: 8px;
  height: 220px;
  border-radius: var(--pwa-radius);
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.hco-location-map--loading,
.hco-location-map--error {
  display: flex;
}

.hco-location-map__error {
  margin: auto;
  padding: 0 16px;
  text-align: center;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
</style>
