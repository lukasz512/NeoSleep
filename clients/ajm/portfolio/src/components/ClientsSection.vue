<!-- Section 06 · Clientes seleccionados: four names only, set large and monochrome (no logo wall).
     They rise in with a small stagger; hovering one dims the rest. -->
<template>
  <section id="clientes" class="clients">
    <p v-reveal class="eyebrow">{{ t("clients.eyebrow") }}</p>
    <ul class="clients__list">
      <li v-for="(name, i) in CLIENT_NAMES" :key="name" v-reveal="{ delay: i * 90 }" class="client">
        <span class="client__num">{{ String(i + 1).padStart(2, "0") }}</span>{{ name }}
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { CLIENT_NAMES } from "../content/cases";
import { vReveal } from "../lib/motion";

const { t } = useI18n();
</script>

<style scoped>
.clients {
  padding: clamp(96px, 12vw, 160px) var(--ajm-gutter);
  border-top: 1px solid var(--ajm-line);
}
.clients__list {
  list-style: none;
  margin: 32px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--ajm-line);
}
.client {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: clamp(28px, 4vw, 56px) 0;
  border-bottom: 1px solid var(--ajm-line);
  font: 500 clamp(26px, 3.6vw, 56px) / 1.05 var(--ajm-font);
  letter-spacing: -0.025em;
  transition: opacity 0.4s ease;
}
.client:nth-child(odd) {
  padding-right: 24px;
}
.clients__list:hover .client:not(:hover) {
  opacity: 0.3;
}
.client__num {
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.16em;
  color: var(--ajm-muted);
}
@media (max-width: 760px) {
  .clients__list {
    grid-template-columns: 1fr;
  }
}
</style>
