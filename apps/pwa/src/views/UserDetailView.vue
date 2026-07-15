<template>
  <div class="view-detail">
    <FormRenderer
      v-if="showEditModal"
      v-model="showEditModal"
      :fields="userFormFields"
      :initial-data="user ?? undefined"
      title-key="user.users.form.title"
      edit-title-key="user.users.form.editTitle"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      @submit="onSubmit"
    />
    <ItemDetailLayout
      :has-content="!!user"
      :loading="loading"
      :back-route="{ name: 'users' }"
      :back-label="t('user.users.detail.back')"
      :not-found-label="t('user.users.detail.notFound')"
      :title="user?.name"
    >
      <template #header-actions v-if="user">
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="view-item__reset-password-btn view-item__reset-password-btn--no-border"
              :aria-label="t('user.users.actions.resetPassword')"
              @click="onResetPassword"
            >
              <AppIcon name="key" class="view-item__reset-password-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.users.actions.resetPassword') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="view-item__toggle-status-btn view-item__toggle-status-btn--no-border"
              :aria-label="t(isActive ? 'user.users.actions.disable' : 'user.users.actions.enable')"
              @click="onToggleStatus"
            >
              <AppIcon name="power" class="view-item__toggle-status-icon" />
            </VBtn>
          </template>
          <span>{{ t(isActive ? 'user.users.actions.disable' : 'user.users.actions.enable') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="view-item__edit-btn view-item__edit-btn--no-border"
              :aria-label="t('user.users.detail.edit')"
              @click="onEdit"
            >
              <AppIcon name="pencil" class="view-item__edit-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.users.detail.edit') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <VBtn
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              class="view-item__delete-btn view-item__delete-btn--no-border"
              :aria-label="t('user.users.actions.delete')"
              @click="showDeleteConfirm = true"
            >
              <AppIcon name="trash" class="view-item__delete-icon" />
            </VBtn>
          </template>
          <span>{{ t('user.users.actions.delete') }}</span>
        </VTooltip>
      </template>

      <template #sections v-if="user">
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.users.detail.email") }}</dt>
          <dd class="view-item__value">
            <a v-if="user.email" :href="`mailto:${user.email}`" class="view-item__link">{{ user.email }}</a>
            <span v-else class="view-item__empty">—</span>
          </dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.users.detail.role") }}</dt>
          <dd class="view-item__value">{{ t(`user.users.role.${roleKey}`) }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.users.detail.status") }}</dt>
          <dd class="view-item__value">{{ t(`user.users.status.${user.status}`) }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.users.detail.region") }}</dt>
          <dd class="view-item__value">{{ user.region || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.users.detail.phone") }}</dt>
          <dd class="view-item__value">
            <a v-if="user.phone" :href="`tel:${user.phone}`" class="view-item__link">{{ user.phone }}</a>
            <span v-else class="view-item__empty">—</span>
          </dd>
        </div>
      </template>
    </ItemDetailLayout>

    <VDialog v-model="showDeleteConfirm" max-width="360" persistent>
      <VCard>
        <VCardText>{{ t("user.users.actions.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <VBtn variant="text" @click="showDeleteConfirm = false">
            {{ t("app.common.cancel") }}
          </VBtn>
          <VBtn color="error" variant="text" @click="onDelete">
            {{ t("user.users.actions.delete") }}
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppIcon from "../components/AppIcon.vue";
import { userFormFields } from "../config/forms/userForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

interface UserDetail {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  status: string;
  region: string | null;
  phone?: string | null;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();

const user = ref<UserDetail | null>(null);
const loading = ref(true);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);

const roleKey = computed(() => user.value?.role ?? "rep");
const isActive = computed(() => user.value?.status === "active");

function onEdit() {
  showEditModal.value = true;
}

async function onSubmit(payload: Record<string, unknown>) {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.users.form.editSuccess"), "success");
    showEditModal.value = false;
    await loadUser();
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

async function onResetPassword() {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}/reset-password`, {
    method: "POST",
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.users.actions.resetPasswordSuccess"), "success");
  }
}

async function onToggleStatus() {
  const id = user.value?.id;
  if (!id) return;
  const nextStatus = isActive.value ? "inactive" : "active";
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus }),
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    notifications.show(
      t(nextStatus === "active" ? "user.users.actions.enableSuccess" : "user.users.actions.disableSuccess"),
      "success",
    );
    await loadUser();
  }
}

async function onDelete() {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "DELETE",
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.users.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "users" });
  }
}

async function loadUser() {
  const id = route.params.id as string;
  if (!id) { loading.value = false; return; }
  loading.value = true;
  user.value = null;
  try {
    // handleErrors: false — we branch ourselves below: 404 (genuinely doesn't
    // exist) is shown via ItemDetailLayout's own not-found empty state, no
    // redundant toast; anything else (500, network) still surfaces a toast so
    // the user knows something actually broke, not just "not found".
    const res = await apiFetch(`/api/v1/users/${id}`, { handleErrors: false });
    if (res.ok) {
      user.value = (await res.json()) as UserDetail;
    } else if (res.status !== 404) {
      notifications.show(t("user.users.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("user.users.errorLoad"), "error");
    user.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadUser);
watch(() => route.params.id, loadUser);
</script>

<style scoped>
.view-detail :deep(.view-item__reset-password-btn),
.view-detail :deep(.view-item__toggle-status-btn) {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  color: var(--pwa-text, rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity))) !important;
}

.view-detail :deep(.view-item__reset-password-btn--no-border),
.view-detail :deep(.view-item__toggle-status-btn--no-border) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08) !important;
  }
}

.view-detail :deep(.view-item__reset-password-icon),
.view-detail :deep(.view-item__toggle-status-icon) {
  width: 22px;
  height: 22px;
  display: block;
}

.view-detail :deep(.view-item__delete-btn) {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
  color: rgb(var(--v-theme-error)) !important;
}

.view-detail :deep(.view-item__delete-btn--no-border) {
  border: none !important;
  box-shadow: none !important;
  background: transparent !important;

  &:hover {
    background: rgba(var(--v-theme-error), 0.12) !important;
  }
}

.view-detail :deep(.view-item__delete-icon) {
  width: 22px;
  height: 22px;
  display: block;
  color: rgb(var(--v-theme-error)) !important;
  stroke: rgb(var(--v-theme-error)) !important;
}
</style>
