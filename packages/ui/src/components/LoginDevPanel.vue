<template>
  <VCard class="dev-panel" variant="outlined" max-width="420" rounded="lg">
    <VCardText>
      <p class="dev-panel__label">{{ t('user.login.loginAsDev') }}</p>
      <VSelect
        v-model="devUser"
        :items="devUserItems"
        item-title="title"
        item-value="id"
        density="comfortable"
        variant="outlined"
        hide-details
        class="dev-panel__select"
      />
      <VBtn
        block
        color="primary"
        variant="outlined"
        class="mt-3"
        @click="emit('login', devUser)"
      >
        {{ t('user.login.goToApp') }}
      </VBtn>
    </VCardText>
  </VCard>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const emit = defineEmits<{ login: [role: string] }>();

const devUser = ref("admin");
const devUserItems = computed(() => [
  { id: "rep",   title: t("user.login.devUser.rep") },
  { id: "admin", title: t("user.login.devUser.admin") },
]);
</script>

<style scoped>
.dev-panel {
  width: 100%;
  max-width: 420px;
}

.dev-panel__label {
  margin: 0 0 8px;
  font-size: 0.875rem;
  font-weight: 500;
  opacity: 0.7;
}

.dev-panel__select {
  margin-bottom: 4px;
}
</style>
