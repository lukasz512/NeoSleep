<!-- Section 06 · Clientes seleccionados: four logos only, monochrome and large (no logo wall).
     Each logo is a one-colour mask (scripts/encode-logos.sh) painted with the text colour, so it
     follows the light/dark theme. They rise in with a small stagger; hovering one dims the rest. -->
<template>
  <section id="clientes" class="clients">
    <p v-reveal class="eyebrow">{{ t("clients.eyebrow") }}</p>
    <ul class="clients__list">
      <li v-for="(c, i) in CLIENTS" :key="c.name" v-reveal="{ delay: i * 90 }" class="client">
        <span class="client__num" aria-hidden="true">{{ String(i + 1).padStart(2, "0") }}</span>
        <span
          class="client__logo"
          role="img"
          :aria-label="c.name"
          :style="{ '--logo': `url(${mediaUrl(c.logo)})`, '--h': c.height }"
        />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { CLIENTS } from "../content/cases";
import { mediaUrl } from "../lib/media";
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
  position: relative;
  display: grid;
  place-items: center;
  min-height: clamp(140px, 16vw, 220px);
  padding: 24px;
  border-bottom: 1px solid var(--ajm-line);
  transition: opacity 0.4s ease;
}
.client:nth-child(odd) {
  border-right: 1px solid var(--ajm-line);
}
.clients__list:hover .client:not(:hover) {
  opacity: 0.3;
}
.client__num {
  position: absolute;
  top: 16px;
  left: 16px;
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.16em;
  color: var(--ajm-muted);
}
/* each logo gets a height tuned to its proportions, so all four read the same size */
.client__logo {
  display: block;
  width: min(100%, 360px);
  height: calc(var(--h, 1) * clamp(28px, 3.4vw, 48px));
  background: currentColor;
  -webkit-mask: var(--logo) center / contain no-repeat;
  mask: var(--logo) center / contain no-repeat;
}
@media (max-width: 760px) {
  .clients__list {
    grid-template-columns: 1fr;
  }
  .client:nth-child(odd) {
    border-right: 0;
  }
}
</style>
