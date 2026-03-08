<template>
  <footer class="default-footer">
    <div class="default-footer__inner">
      <div class="default-footer__brand">
        <img
          src="/brand/logos/logo_dark.svg"
          alt="NeoSleep"
          class="default-footer__logo"
          width="140"
          height="32"
        />
        <p class="default-footer__tagline">{{ t("website.footer.tagline") }}</p>
      </div>
      <div
        v-for="section in footerSections"
        :key="section.headingKey"
        class="default-footer__col"
      >
        <h4 class="default-footer__heading">{{ t(section.headingKey) }}</h4>
        <a
          v-for="link in section.links"
          :key="link.labelKey"
          :href="link.href"
          class="default-footer__link"
        >
          {{ t(link.labelKey) }}
        </a>
      </div>
    </div>
    <div class="default-footer__copy">
      <p>© {{ new Date().getFullYear() }} NeoSleep. {{ t("website.footer.rights") }}</p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

interface FooterLink {
  href: string;
  labelKey: string;
}

interface FooterSection {
  headingKey: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    headingKey: "website.footer.product",
    links: [
      { href: "/#solutions", labelKey: "website.footer.product.solutions" },
      { href: "/#for-dentists", labelKey: "website.footer.product.forDentists" },
      { href: "/#for-patients", labelKey: "website.footer.product.forPatients" },
      { href: "/#cta", labelKey: "website.footer.product.pricing" },
    ],
  },
  {
    headingKey: "website.footer.company",
    links: [
      { href: "/about", labelKey: "website.footer.company.about" },
      { href: "#", labelKey: "website.footer.company.careers" },
      { href: "#", labelKey: "website.footer.company.press" },
      { href: "/contact", labelKey: "website.footer.company.contact" },
    ],
  },
  {
    headingKey: "website.footer.resources",
    links: [
      { href: "#", labelKey: "website.footer.resources.blog" },
      { href: "#", labelKey: "website.footer.resources.help" },
      { href: "#", labelKey: "website.footer.resources.research" },
      { href: "#", labelKey: "website.footer.resources.privacy" },
    ],
  },
  {
    headingKey: "website.footer.connect",
    links: [
      { href: "#", labelKey: "website.footer.connect.twitter" },
      { href: "#", labelKey: "website.footer.connect.linkedin" },
      { href: "#", labelKey: "website.footer.connect.facebook" },
      { href: "#", labelKey: "website.footer.connect.instagram" },
    ],
  },
];
</script>

<style lang="scss" scoped>
.default-footer {
  background: var(--website-footer-bg);
  color: #fff;
  padding: 3rem 1.5rem 2rem;
  position: relative;
  z-index: 2;
  width: calc(100% - 3rem);
  max-width: 1280px;
  margin: 2rem auto 0;
  border-radius: calc(var(--website-radius) * 2);
  border-top-left-radius: calc(var(--website-radius) * 2);
  border-top-right-radius: calc(var(--website-radius) * 2);
}

.default-footer__inner {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.5fr repeat(4, 1fr);
  gap: 2rem;
}

@media (max-width: 600px) {
  .default-footer__inner {
    grid-template-columns: 1fr;
    text-align: center;
  }
}

.default-footer__brand {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.default-footer__logo {
  height: 32px;
  width: auto;
  display: block;
  align-self: flex-start;
}

.default-footer__tagline {
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.5;
  margin: 0;
  max-width: 240px;
}

.default-footer__heading {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.9);
  margin: 0 0 1rem;
}

.default-footer__col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.default-footer__link {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.875rem;
  text-decoration: none;
  transition: color 0.2s ease;

  &:hover {
    color: #fff;
  }
}

.default-footer__copy {
  padding-top: 2rem;
  margin-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  text-align: center;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.75);

  p {
    margin: 0;
  }
}
</style>
