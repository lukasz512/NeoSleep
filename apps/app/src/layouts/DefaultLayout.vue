<template>
  <div class="layout-default">
    <main id="main-content" class="layout-default__main" role="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.layout-default {
  min-height: 100vh;
  padding: 16px;
}

.layout-default__main {
  outline: none;
}
</style>
