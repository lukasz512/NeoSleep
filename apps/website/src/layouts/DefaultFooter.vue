<template>
  <footer class="site-footer" role="contentinfo">
    <div class="site-footer__inner">
      <div class="site-footer__brand">
        <img
          :src="logoUrl"
          alt="NeoSleep"
          class="site-footer__logo"
          width="140"
          height="32"
        />
        <p class="site-footer__tagline">{{ t("website.footer.tagline") }}</p>
      </div>
      <div
        v-for="section in sections"
        :key="section.id"
        class="site-footer__col"
      >
        <h4 class="site-footer__heading">{{ t(section.headingKey) }}</h4>
        <template v-for="item in section.items" :key="item.labelKey">
          <RouterLink v-if="item.to" :to="item.to" class="site-footer__link">
            {{ t(item.labelKey) }}
          </RouterLink>
          <a v-else :href="item.href" class="site-footer__link">
            {{ t(item.labelKey) }}
          </a>
        </template>
      </div>
    </div>
    <div class="site-footer__copy">
      <p>© {{ new Date().getFullYear() }} NeoSleep. {{ t("website.footer.rights") }}</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import {
  footerSections,
  getFooterNavItemsBySection,
  type WebsiteNavItem,
} from "../config/websiteNavConfig";

const logoUrl = "/brand/logos/logo/logo_dark.svg";
const { t } = useI18n();

const sections = computed(() => {
  const bySection = getFooterNavItemsBySection();
  return footerSections
    .map((sec) => ({
      id: sec.id,
      headingKey: sec.headingKey,
      items: (bySection.get(sec.id) ?? []) as WebsiteNavItem[],
    }))
    .filter((sec) => sec.items.length > 0);
});

onMounted(() => {
  console.log("[Footer] mounted");
});
</script>

<style scoped>
.site-footer {
  background: #082a27;
  color: #fff;
  padding: 3rem 1.5rem 2rem;
  margin-top: auto;
}

.site-footer__inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  gap: 2rem;
}

@media (max-width: 600px) {
  .site-footer__inner {
    grid-template-columns: 1fr;
    text-align: center;
  }
}

.site-footer__brand {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.site-footer__logo {
  height: 32px;
  width: auto;
  display: block;
  align-self: flex-start;
}

.site-footer__tagline {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
  margin: 0;
  max-width: 240px;
}

.site-footer__heading {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 1rem;
}

.site-footer__col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.site-footer__link {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  text-decoration: none;
}

.site-footer__link:hover {
  color: #fff;
}

.site-footer__copy {
  padding-top: 2rem;
  margin-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.75);
}

.site-footer__copy p {
  margin: 0;
}
</style>
