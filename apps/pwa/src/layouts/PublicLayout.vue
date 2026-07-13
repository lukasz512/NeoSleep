<template>
  <div class="layout-public">
    <main id="main-content" class="layout-public__main" role="main">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.layout-public {
  min-height: 100vh;
  padding: 16px;
}

.layout-public__main {
  outline: none;
}
</style>
