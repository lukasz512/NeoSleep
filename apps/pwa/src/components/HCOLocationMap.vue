<template>
  <div ref="mapContainer" class="hco-location-map" :class="{ 'hco-location-map--loading': loading }" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { loadGoogleMaps, CLEAN_MAP_STYLES } from "../composables/useGoogleMaps";

/** Single-pin map for one organization's address — HCODetailView's Details
 *  tab. See apps/web/src/views/FindSpecialistView.vue for the multi-pin,
 *  clickable-marker version this is a simplified sibling of (no bounds
 *  fitting or info window needed for just one, already-on-screen location). */
const props = defineProps<{
  latitude: number;
  longitude: number;
  name: string;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const loading = ref(true);
let map: google.maps.Map | null = null;
let marker: google.maps.Marker | null = null;

async function render() {
  if (!mapContainer.value) return;
  loading.value = true;
  try {
    const g = await loadGoogleMaps();
    const position = { lat: props.latitude, lng: props.longitude };
    if (!map) {
      map = new g.maps.Map(mapContainer.value, {
        center: position,
        zoom: 15,
        styles: CLEAN_MAP_STYLES,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControl: true,
      });
    } else {
      map.setCenter(position);
    }
    marker?.setMap(null);
    marker = new g.maps.Marker({ position, map, title: props.name });
  } catch {
    // No key configured / script failed to load — the map area is simply
    // left blank rather than showing an error state, same as a missing
    // photo would be: address text above still has the full information.
  } finally {
    loading.value = false;
  }
}

onMounted(render);
watch(() => [props.latitude, props.longitude], render);
onBeforeUnmount(() => {
  marker?.setMap(null);
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

.hco-location-map--loading {
  display: flex;
}
</style>
