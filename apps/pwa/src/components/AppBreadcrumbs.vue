<template>
  <nav class="app-breadcrumbs" :aria-label="t('app.common.breadcrumbs')">
    <ol class="app-breadcrumbs__list">
      <li v-for="(item, i) in items" :key="i" class="app-breadcrumbs__item">
        <RouterLink :to="item.to" class="app-breadcrumbs__link">{{ item.label }}</RouterLink>
        <AppIcon name="chevron-right" class="app-breadcrumbs__sep" aria-hidden="true" />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
/**
 * Record-header eyebrow trail (NEO-56, Salesforce Lightning / Veeva pattern):
 * the ancestor levels only, small caps above the record's name — the current
 * page is the h1 right below, so it is never repeated here (NHS/GOV.UK rule).
 * Each level ends in a separator pointing at that title.
 */
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import type { BreadcrumbItem } from "./AppBreadcrumbs.types";

defineProps<{
  items: BreadcrumbItem[];
}>();

const { t } = useI18n();
</script>

<style scoped>
.app-breadcrumbs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.app-breadcrumbs__item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.app-breadcrumbs__link {
  position: relative;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  border-radius: 4px;
}
/* 44px-tall hit area (Apple HIG / WCAG 2.5.5) without growing the small
   eyebrow line itself — reps tap this on tablets. */
.app-breadcrumbs__link::before {
  content: "";
  position: absolute;
  inset: -14px -8px;
}
.app-breadcrumbs__link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.app-breadcrumbs__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}

.app-breadcrumbs__sep {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: rgb(var(--v-theme-primary));
}
</style>
