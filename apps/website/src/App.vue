<template>
  <DefaultLayout>
    <RouterView v-slot="{ Component }">
      <Transition name="view-fade-lift" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </DefaultLayout>
</template>

<script setup lang="ts">
import DefaultLayout from "./layouts/DefaultLayout.vue";
import { useDocumentLang } from "@shared/composables/useDocumentLang";
import { useAppHead } from "./composables/useAppHead";
import { useSmoothScrollAnchors } from "@shared/composables/useSmoothScrollAnchors";
import "./assets/website-theme.scss";
import "@shared/styles/transitions.css";

useDocumentLang();
useAppHead();
useSmoothScrollAnchors();
</script>
