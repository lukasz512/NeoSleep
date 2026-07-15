<template>
  <div class="users-view">
    <AppEntityList
      view-id="users"
      api-endpoint="/api/v1/users"
      :headers="tableHeaders"
      :filter-definitions="usersFilterDefinitions"
      :i18n="usersI18n"
      :show-add-button="true"
      detail-route-name="user-detail"
      :filter-param-keys="['role', 'status']"
      @add="onAdd"
    >
      <template #item.role="{ item }">
        {{ t(`user.users.role.${roleKeyOf(item as Record<string, unknown>)}`) }}
      </template>
      <template #item.status="{ item }">
        <span :class="['users-view__status', `users-view__status--${(item as Record<string, unknown>).status}`]">
          {{ t(`user.users.status.${(item as Record<string, unknown>).status}`) }}
        </span>
      </template>
      <template #item.actions="{ item }">
        <VBtn icon variant="text" size="small" :aria-label="t('user.users.detail.edit')" @click.stop="onRowEdit(item as Record<string, unknown>)">
          <AppIcon name="pencil" class="users-view__row-icon" />
        </VBtn>
        <VBtn icon variant="text" size="small" :aria-label="t('user.users.actions.delete')" @click.stop="onRowDeleteClick(item as Record<string, unknown>)">
          <AppIcon name="trash" class="users-view__row-icon users-view__row-icon--error" />
        </VBtn>
      </template>
      <template #feed-card-actions="{ item }">
        <VBtn icon variant="text" size="small" :aria-label="t('user.users.detail.edit')" @click="onRowEdit(item as Record<string, unknown>)">
          <AppIcon name="pencil" class="users-view__row-icon" />
        </VBtn>
        <VBtn icon variant="text" size="small" :aria-label="t('user.users.actions.delete')" @click="onRowDeleteClick(item as Record<string, unknown>)">
          <AppIcon name="trash" class="users-view__row-icon users-view__row-icon--error" />
        </VBtn>
      </template>
    </AppEntityList>

    <FormRenderer
      v-if="showForm"
      v-model="showForm"
      :fields="userFormFields"
      :initial-data="editingUser ?? undefined"
      title-key="user.users.form.title"
      edit-title-key="user.users.form.editTitle"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      @submit="onSubmit"
    />

    <ConfirmDialog
      v-model="showDeleteConfirm"
      :message="t('user.users.actions.deleteConfirmText')"
      :confirm-label="t('user.users.actions.delete')"
      :cancel-label="t('app.common.cancel')"
      @confirm="onDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import type { FilterDefinition } from "../composables/useFilters";
import { userFormFields } from "../config/forms/userForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

const { t } = useI18n();
const notifications = useNotifications();

const showForm = ref(false);
const editingUser = ref<Record<string, unknown> | null>(null);
const showDeleteConfirm = ref(false);
const deletingUserId = ref<string | null>(null);

const usersFilterDefs: FilterDefinition[] = [
  { key: "role", labelKey: "user.users.filters.role", type: "select", default: "" },
  { key: "status", labelKey: "user.users.filters.status", type: "select", default: "" },
];

const roleFilterOptions = computed(() => [
  { title: t("user.users.filters.all"), value: "" },
  { title: t("user.users.role.admin"), value: "admin" },
  { title: t("user.users.role.manager"), value: "manager" },
  { title: t("user.users.role.rep"), value: "rep" },
  { title: t("user.users.role.doctor"), value: "doctor" },
]);
const statusFilterOptions = computed(() => [
  { title: t("user.users.filters.all"), value: "" },
  { title: t("user.users.status.active"), value: "active" },
  { title: t("user.users.status.inactive"), value: "inactive" },
  { title: t("user.users.status.suspended"), value: "suspended" },
]);

const usersFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...usersFilterDefs[0], options: roleFilterOptions.value },
  { ...usersFilterDefs[1], options: statusFilterOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.users.table.name"), key: "name", sortable: true },
  { title: t("user.users.table.email"), key: "email", sortable: true },
  { title: t("user.users.table.role"), key: "role", sortable: false },
  { title: t("user.users.table.status"), key: "status", sortable: true },
  { title: "", key: "actions", sortable: false },
]);

const usersI18n = computed(() => ({
  searchPlaceholder: "user.users.searchPlaceholder",
  filtersTitle: "user.users.filters.title",
  filtersClear: "user.users.filters.clear",
  add: "user.users.add",
  emptyTitle: "user.users.emptyTitle",
  emptySubtitle: "user.users.emptySubtitle",
  noResultsForCriteria: "user.users.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.users.noResultsForCriteriaSubtitle",
  tableNoResults: "user.users.table.noResults",
  errorLoad: "user.users.errorLoad",
}));

function roleKeyOf(item: Record<string, unknown>): string {
  return String(item.role ?? "rep");
}

function onAdd() {
  editingUser.value = null;
  showForm.value = true;
}

function onRowEdit(item: Record<string, unknown>) {
  editingUser.value = item;
  showForm.value = true;
}

function onRowDeleteClick(item: Record<string, unknown>) {
  deletingUserId.value = String(item.id);
  showDeleteConfirm.value = true;
}

async function onSubmit(payload: Record<string, unknown>) {
  const id = editingUser.value?.id;
  const res = await apiFetch(id ? `/api/v1/users/${id}` : "/api/v1/users", {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    notifications.show(t(id ? "user.users.form.editSuccess" : "user.users.form.success"), "success");
    showForm.value = false;
    editingUser.value = null;
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}

async function onDelete() {
  const id = deletingUserId.value;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "DELETE",
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    deletingUserId.value = null;
    notifications.show(t("user.users.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
}
</script>

<style scoped>
.users-view {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.users-view__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.users-view__status--active {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.users-view__status--inactive,
.users-view__status--suspended {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.users-view__row-icon {
  width: 18px;
  height: 18px;
  display: block;
}

.users-view__row-icon--error {
  color: rgb(var(--v-theme-error));
  stroke: rgb(var(--v-theme-error));
}
</style>
