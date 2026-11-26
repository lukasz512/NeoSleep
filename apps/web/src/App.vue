<template>
  <component :is="currentLayout">
    <RouterView v-slot="{ Component }">
      <Transition name="view-fade-lift" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import DefaultLayout from "./layouts/DefaultLayout.vue";
import EventLayout from "./layouts/EventLayout.vue";
import { useI18n } from "vue-i18n";
import { useDocumentLang } from "@i18n/useDocumentLang";
import { useAppHead } from "./composables/useAppHead";
import { useSmoothScrollAnchors } from "./composables/useSmoothScrollAnchors";
import "./assets/website-theme.scss";
import "./assets/website-responsive.scss";
import "@brand/transitions.css";

const { locale } = useI18n();
useDocumentLang(locale);
useAppHead();

const route = useRoute();
const currentLayout = computed(() =>
  route.meta.layout === "event" ? EventLayout : DefaultLayout
);

useSmoothScrollAnchors();
</script>
