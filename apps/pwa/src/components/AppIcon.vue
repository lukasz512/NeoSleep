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
    // pathLength="1" on every shape below (also see "sad-cloud", "search")
    // normalizes each one to a 0..1 stroke-dasharray space regardless of its
    // actual geometry — lets AppStateView's icon-draw animation use one fixed
    // `stroke-dasharray: 1; stroke-dashoffset: 1 → 0` for any icon, no
    // per-icon path-length measuring. No effect anywhere dasharray/dashoffset
    // isn't set (i.e. every other usage of these icons in the app).
    paths: `<circle cx="12" cy="12" r="10" pathLength="1" />
            <line x1="12" y1="8" x2="12" y2="16" stroke-width="2" pathLength="1" />
            <line x1="8" y1="12" x2="16" y2="12" stroke-width="2" pathLength="1" />`,
  },
  "sad-cloud": {
    strokeWidth: 1.8,
    // The raw cloud outline touches x=0 and x=24 exactly, so its 1.8px stroke
    // overflows the viewBox and gets clipped left/right. Scale it down around
    // the viewBox center to leave room for the stroke on every side.
    paths: `<g transform="translate(12 12) scale(0.8) translate(-12 -12)">
            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" pathLength="1" />
            <path d="M7.4 10.6L9.2 12.4M7.4 12.4L9.2 10.6" stroke-width="1.3" pathLength="1" />
            <path d="M14.8 10.6L16.6 12.4M14.8 12.4L16.6 10.6" stroke-width="1.3" pathLength="1" />
            <path d="M8 17 Q12 14 16 17" stroke-width="1.3" pathLength="1" />
            </g>`,
  },
  "file": {
    strokeWidth: 1.5,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />`,
  },
  "file-pdf": {
    strokeWidth: 1.5,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />`,
  },
  "file-image": {
    strokeWidth: 1.5,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <circle cx="10" cy="13" r="1.1" />
            <path d="M7 18l3.5-4 2.5 3 2-2.5L17 18" />`,
  },
  "file-archive": {
    strokeWidth: 1.5,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="9" x2="12" y2="21" />
            <line x1="10.6" y1="11.5" x2="13.4" y2="11.5" stroke-width="1.2" />
            <line x1="10.6" y1="14.5" x2="13.4" y2="14.5" stroke-width="1.2" />
            <line x1="10.6" y1="17" x2="13.4" y2="17" stroke-width="1.2" />
            <rect x="10.6" y="18" width="2.8" height="2.2" rx="0.6" fill="currentColor" stroke="none" />`,
  },
  "file-video": {
    strokeWidth: 1.5,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <path d="M10.5 12.5v5l4-2.5z" fill="currentColor" stroke="none" />`,
  },
  // ── Action icons ─────────────────────────────────────────────────────────
  "plus": {
    strokeWidth: 2,
    paths: `<line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />`,
  },
  "minus": {
    strokeWidth: 2,
    paths: `<line x1="5" y1="12" x2="19" y2="12" />`,
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
    paths: `<path d="M7 20v-8a5 5 0 0 1 10 0v8" />
            <line x1="5" y1="20" x2="9" y2="20" />
            <line x1="15" y1="20" x2="19" y2="20" />`,
  },
  "nav-hcp": {
    strokeWidth: 2,
    paths: `<path d="M11 2v2" />
            <path d="M5 2v2" />
            <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
            <path d="M8 15a6 6 0 0 0 12 0v-3" />
            <circle cx="20" cy="10" r="2" />
            <circle cx="20" cy="10" r="0.6" fill="currentColor" />`,
  },
  "nav-hco": {
    strokeWidth: 2,
    paths: `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <line x1="12" y1="9" x2="12" y2="15" />
            <line x1="9" y1="12" x2="15" y2="12" />`,
  },
  // ── HCO type-specific avatar icons (hospital/pharmacy/practice/other) ──────
  // "clinic" keeps the "nav-hco" icon above (unchanged, matches the ticket).
  "hco-hospital": {
    strokeWidth: 2,
    // Building outline + a single centered cross — dropped the two window
    // divider lines from the original design (Łukasz's pick from 3
    // minimalist candidates, 2026-09-21): four internal lines plus the cross
    // read as busy at 40px avatar scale.
    paths: `<rect x="3" y="4" width="18" height="17" />
            <line x1="12" y1="7" x2="12" y2="17" />
            <line x1="7" y1="12" x2="17" y2="12" />`,
  },
  "hco-pharmacy": {
    strokeWidth: 2,
    // Dividing line spans exactly the pre-rotation rect's own y-bounds (8..16),
    // flush with its top/bottom edge, so it never overshoots the pill outline.
    paths: `<rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(45 12 12)" />
            <line x1="12" y1="8" x2="12" y2="16" transform="rotate(45 12 12)" />`,
  },
  "hco-practice": {
    strokeWidth: 2,
    paths: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
            <line x1="12" y1="16.5" x2="12" y2="19.5" stroke-width="1.4" />
            <line x1="10.5" y1="18" x2="13.5" y2="18" stroke-width="1.4" />`,
  },
  "hco-other": {
    strokeWidth: 2,
    paths: `<path d="M4 10l1-5h14l1 5" />
            <path d="M4 10a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" />
            <path d="M5 10v11h14V10" />
            <line x1="10" y1="21" x2="10" y2="15" />
            <line x1="14" y1="21" x2="14" y2="15" />`,
  },
  "nav-patients": {
    strokeWidth: 2,
    paths: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />`,
  },
  // ── HCP specialty icons (practitioner list mobile card, NEO-19) ────────────
  // Keyed by the `specialty` lookup's seeded codes (apps/api/migrations/002_seed.sql).
  // A tenant-added or unseeded code falls back to "nav-hcp" — see hcpLabels.ts.
  "specialty-dentist": {
    strokeWidth: 1.6,
    paths: `<path d="M12 4C10 4 9 5 7.5 5S5 4 4 4C2.5 4 2 5.5 2.3 8c.3 2.5 1.2 4.5 2 7 .5 1.8 1 3.5 1.8 4.6.4.5.9.9 1.4.9.9 0 1.2-1.1 1.5-3 .2-1.3.5-2.3 1-2.3s.8 1 1 2.3c.3 1.9.6 3 1.5 3 .5 0 1-.4 1.4-.9.8-1.1 1.3-2.8 1.8-4.6.8-2.5 1.7-4.5 2-7C21.7 5.5 21 4 19.6 4c-1 0-1.9 1-3.1 1S14 4 12 4z" stroke-linejoin="round" />`,
  },
  "specialty-ent": {
    strokeWidth: 1.6,
    paths: `<path d="M9 12c0-3.3 2.2-5.5 5-5.5a4.5 4.5 0 0 1 4.5 4.5c0 2.2-1.3 3.2-1.3 5.2a3.2 3.2 0 0 1-6.4 0" />
            <path d="M9 12v1" />`,
  },
  "specialty-gp": {
    strokeWidth: 1.6,
    paths: `<path d="M6 3v6a4 4 0 0 0 8 0V3" />
            <path d="M10 13v3a5 5 0 0 0 10 0v-2" />
            <circle cx="20" cy="12" r="2" />`,
  },
  "specialty-neurologist": {
    strokeWidth: 1.6,
    paths: `<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5h2a3 3 0 0 0 3-3V7a3 3 0 0 0-2-3z" />
            <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5h-2a3 3 0 0 1-3-3V7a3 3 0 0 1 2-3z" />`,
  },
  "specialty-psychiatrist": {
    strokeWidth: 1.6,
    paths: `<path d="M9 21v-3.5c-2-1-3-3-3-5.5a6 6 0 0 1 12 0c0 1.2-.3 2.2-.8 3.1" />
            <path d="M15 21v-2" />
            <path d="M11 9a2 2 0 1 1 2 2" />`,
  },
  "specialty-cardiologist": {
    strokeWidth: 1.6,
    paths: `<path d="M20.8 8.6a5.5 5.5 0 0 0-9.8-3.4 5.5 5.5 0 0 0-9.8 3.4c0 5 9.8 10.4 9.8 10.4s9.8-5.4 9.8-10.4z" stroke-linejoin="round" />
            <polyline points="3 12 7 12 9 8 12 16 14 12 21 12" />`,
  },
  "specialty-pulmonologist": {
    strokeWidth: 1.6,
    paths: `<path d="M12 3v7" />
            <path d="M12 10c-1-3-3-4-5-4-2 0-3 2-3 5 0 4 1 7 3 8 1.5 1 2.5 0 3-2l1-3" />
            <path d="M12 10c1-3 3-4 5-4 2 0 3 2 3 5 0 4-1 7-3 8-1.5 1-2.5 0-3-2l-1-3" />`,
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
  "nav-resources": {
    strokeWidth: 2,
    paths: `<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />`,
  },
  "nav-users": {
    strokeWidth: 2,
    paths: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />`,
  },
  "nav-sleep-studies": {
    strokeWidth: 2,
    paths: `<path d="M22 12h-4l-3 9L9 3l-3 9H2" />`,
  },
  "nav-treatment-plans": {
    strokeWidth: 2,
    paths: `<path d="M21 8l-9-5-9 5 9 5 9-5z" />
            <path d="M3 8v8l9 5 9-5V8" />
            <line x1="12" y1="13" x2="12" y2="21" />`,
  },
  "nav-territories": {
    strokeWidth: 2,
    paths: `<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
            <circle cx="12" cy="9" r="2.5" />`,
  },
  "nav-document-content": {
    strokeWidth: 2,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
            <line x1="8" y1="9" x2="10" y2="9" />`,
  },
  // ── Patient intake form icons (NEO-54, see config/patientIntakeForms.ts) ──
  "form-consent": {
    strokeWidth: 2,
    paths: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <polyline points="9 15 11 17 15 13" />`,
  },
  "form-history": {
    strokeWidth: 2,
    paths: `<rect x="5" y="4" width="14" height="18" rx="2" />
            <path d="M9 4V2.5h6V4" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="9" y1="14" x2="15" y2="14" />
            <line x1="9" y1="18" x2="12" y2="18" />`,
  },
  "form-screening": {
    strokeWidth: 2,
    paths: `<line x1="4" y1="6" x2="6" y2="6" />
            <line x1="4" y1="12" x2="6" y2="12" />
            <line x1="4" y1="18" x2="6" y2="18" />
            <line x1="10" y1="6" x2="20" y2="6" />
            <line x1="10" y1="12" x2="20" y2="12" />
            <line x1="10" y1="18" x2="20" y2="18" />`,
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
  "arrow-right": {
    strokeWidth: 2,
    paths: `<path d="M5 12h14M12 5l7 7-7 7" />`,
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
    paths: `<circle cx="11" cy="11" r="8" pathLength="1" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" pathLength="1" />`,
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
  "dots-vertical": {
    strokeWidth: 2,
    paths: `<circle cx="12" cy="5" r="1" fill="currentColor" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <circle cx="12" cy="19" r="1" fill="currentColor" />`,
  },
  // ── Form-field icons (Identity template + HCO/HCP contact fields) ──────────
  "mail": {
    strokeWidth: 2,
    paths: `<rect x="2" y="4" width="20" height="16" rx="2" />
            <polyline points="2 6 12 13 22 6" />`,
  },
  "phone": {
    strokeWidth: 2,
    paths: `<path d="M4 3h4l2 6-3 2a12 12 0 0 0 6 6l2-3 6 2v4a2 2 0 0 1-2 2A17 17 0 0 1 2 5a2 2 0 0 1 2-2z" />`,
  },
  "globe": {
    strokeWidth: 1.5,
    paths: `<circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z" />`,
  },
  "id-card": {
    strokeWidth: 2,
    paths: `<rect x="2" y="5" width="20" height="14" rx="2" />
            <circle cx="8" cy="12" r="2" />
            <line x1="14" y1="10" x2="19" y2="10" />
            <line x1="14" y1="14" x2="19" y2="14" />`,
  },
  "linkedin": {
    strokeWidth: 1.5,
    paths: `<rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="7" y1="10" x2="7" y2="16" />
            <circle cx="7" cy="7" r="0.5" fill="currentColor" />
            <path d="M11 16v-4a2 2 0 0 1 4 0v4" />
            <line x1="11" y1="10" x2="11" y2="16" />`,
  },
  "instagram": {
    strokeWidth: 1.5,
    paths: `<rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />`,
  },
  "facebook": {
    strokeWidth: 1.5,
    paths: `<rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M14 21v-7h2.5l0.5-3H14V9a1.5 1.5 0 0 1 1.5-1.5H17V5h-2A3.5 3.5 0 0 0 11.5 8.5V11H9.5v3H11.5v7" />`,
  },
  "map-pin": {
    strokeWidth: 1.75,
    paths: `<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
            <circle cx="12" cy="10" r="2.5" />`,
  },
  "at": {
    strokeWidth: 1.75,
    paths: `<circle cx="12" cy="12" r="4" />
            <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />`,
  },
  "info-circle": {
    strokeWidth: 1.6,
    paths: `<circle cx="12" cy="12" r="9" />
            <line x1="12" y1="11" x2="12" y2="16" />
            <circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none" />`,
  },
  "bell": {
    strokeWidth: 1.6,
    paths: `<path d="M12 3.5c-2.9 0-5 2.3-5 5.2 0 3.7-.9 5.7-1.8 6.8a1 1 0 0 0 .8 1.6h12a1 1 0 0 0 .8-1.6c-.9-1.1-1.8-3.1-1.8-6.8 0-2.9-2.1-5.2-5-5.2z" />
            <path d="M9.5 20a2.5 2.5 0 0 0 5 0" />`,
  },
  "check-circle": {
    strokeWidth: 1.6,
    paths: `<circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.5 2.5L16 9.5" />`,
  },
  "alert-triangle": {
    strokeWidth: 1.6,
    paths: `<path d="M12 3.5L21.5 20h-19z" stroke-linejoin="round" />
            <line x1="12" y1="9.5" x2="12" y2="14" />
            <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />`,
  },
  "alert-circle": {
    strokeWidth: 1.6,
    paths: `<circle cx="12" cy="12" r="9" />
            <line x1="12" y1="7.5" x2="12" y2="13" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />`,
  },
  // ── Primary-clinic toggle (practitioner affiliations panel, NEO-17) ────────
  "star": {
    strokeWidth: 1.5,
    paths: `<path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.8 1.4 6.9L12 17.7l-6.1 3.6 1.4-6.9-5.1-4.8 6.9-.8z" fill="currentColor" stroke-linejoin="round" />`,
  },
  "star-outline": {
    strokeWidth: 1.5,
    paths: `<path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.8 1.4 6.9L12 17.7l-6.1 3.6 1.4-6.9-5.1-4.8 6.9-.8z" stroke-linejoin="round" />`,
  },
} as const;
</script>

<style scoped>
/* Zero-specificity default so any consumer's own sizing class (e.g. for the
   large empty-state icons) always wins regardless of stylesheet order. */
:where(.app-icon) {
  width: 20px;
  height: 20px;
}

.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
