<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="ICONS[name].paths"
    :style="{ strokeWidth: ICONS[name].strokeWidth }"
  />
</template>

<script setup lang="ts">
export type AppIconName = keyof typeof ICONS;

defineProps<{
  name: AppIconName;
}>();

const ICONS = {
  // ── State icons ──────────────────────────────────────────────────────────
  "plus-circle": {
    strokeWidth: 1.5,
    paths: `<circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" stroke-width="2" />
            <line x1="8" y1="12" x2="16" y2="12" stroke-width="2" />`,
  },
  "sad-cloud": {
    strokeWidth: 1.25,
    paths: `<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            <circle cx="8.5" cy="14" r="0.8" />
            <circle cx="15.5" cy="14" r="0.8" />
            <path d="M9 17.5 Q12 19.5 15 17.5" />`,
  },
  // ── Action icons ─────────────────────────────────────────────────────────
  "plus": {
    strokeWidth: 2,
    paths: `<line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />`,
  },
  "refresh": {
    strokeWidth: 2,
    paths: `<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 21h5v-5" />`,
  },
  "logout": {
    strokeWidth: 1.5,
    paths: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />`,
  },
  // ── Theme icons ───────────────────────────────────────────────────────────
  "sun": {
    strokeWidth: 1.5,
    paths: `<circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />`,
  },
  "moon": {
    strokeWidth: 1.5,
    paths: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />`,
  },
  // ── Navigation icons ──────────────────────────────────────────────────────
  "nav-dashboard": {
    strokeWidth: 2,
    paths: `<rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />`,
  },
  "nav-leads": {
    strokeWidth: 2,
    paths: `<line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />`,
  },
  "nav-hcp": {
    strokeWidth: 2,
    paths: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
            <line x1="12" y1="13" x2="12" y2="17" />
            <line x1="10" y1="15" x2="14" y2="15" />`,
  },
  "nav-hco": {
    strokeWidth: 2,
    paths: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <line x1="12" y1="9" x2="12" y2="15" />
            <line x1="9" y1="12" x2="15" y2="12" />`,
  },
  "nav-patients": {
    strokeWidth: 2,
    paths: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
            <path d="M8 13h8" />`,
  },
  "nav-planner": {
    strokeWidth: 2,
    paths: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />`,
  },
  "nav-presentations": {
    strokeWidth: 2,
    paths: `<rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />`,
  },
  "nav-users": {
    strokeWidth: 2,
    paths: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  },
  // ── Generic UI icons ──────────────────────────────────────────────────────
  "close": {
    strokeWidth: 2,
    paths: `<path d="M18 6L6 18M6 6l12 12" />`,
  },
  "chevron-down": {
    strokeWidth: 2,
    paths: `<polyline points="6 9 12 15 18 9" />`,
  },
  "chevron-up": {
    strokeWidth: 2,
    paths: `<path d="M18 15l-6-6-6 6" />`,
  },
  "arrow-left": {
    strokeWidth: 2,
    paths: `<path d="M19 12H5M12 19l-7-7 7-7" />`,
  },
  "chevron-left": {
    strokeWidth: 2,
    paths: `<path d="M15 18l-6-6 6-6" />`,
  },
  "chevron-right": {
    strokeWidth: 2,
    paths: `<path d="M9 18l6-6-6-6" />`,
  },
  "filter": {
    strokeWidth: 2,
    paths: `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />`,
  },
  "video-camera": {
    strokeWidth: 2,
    paths: `<polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" />`,
  },
  "users-group": {
    strokeWidth: 2,
    paths: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  },
  "search": {
    strokeWidth: 2,
    paths: `<circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />`,
  },
  "menu": {
    strokeWidth: 2,
    paths: `<rect x="3" y="4" width="18" height="4" rx="1" />
            <rect x="3" y="10" width="18" height="4" rx="1" />
            <rect x="3" y="16" width="18" height="4" rx="1" />`,
  },
  "calendar": {
    strokeWidth: 2,
    paths: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />`,
  },
  "pencil": {
    strokeWidth: 2,
    paths: `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />`,
  },
  "user-arrow": {
    strokeWidth: 2,
    paths: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            <path d="M8 20h8M14 18l2 2-2 2" />`,
  },
  "key": {
    strokeWidth: 2,
    paths: `<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />`,
  },
  "power": {
    strokeWidth: 2,
    paths: `<path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />`,
  },
  "trash": {
    strokeWidth: 2,
    paths: `<polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />`,
  },
} as const;
</script>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
