<template>
  <div class="view-home">
    <HomeHero />
    <HomeStats />
    <HomeSolutions />
    <HomeSplitSection v-for="section in splitSections" :key="section.id" :section="section" />
    <HomeCtaBanner />
  </div>
</template>

<script setup lang="ts">
import HomeHero       from "../components/HomeHero.vue";
import HomeStats      from "../components/HomeStats.vue";
import HomeSolutions  from "../components/HomeSolutions.vue";
import HomeSplitSection from "../components/HomeSplitSection.vue";
import HomeCtaBanner  from "../components/HomeCtaBanner.vue";
import { splitSections } from "../config/websiteContent";
</script>

<style lang="scss" src="../components/icons/home-icons.scss"></style>
