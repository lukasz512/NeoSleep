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
    </AppEntityList>

    <FormRenderer
      v-if="showForm"
      v-model="showForm"
      :fields="userFormFields"
      title-key="user.users.form.title"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      @submit="onSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import type { FilterDefinition } from "../composables/useFilters";
import { userFormFields } from "../config/forms/userForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

const { t } = useI18n();
const notifications = useNotifications();

const showForm = ref(false);

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
  showForm.value = true;
}

async function onSubmit(payload: Record<string, unknown>) {
  const res = await apiFetch("/api/v1/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    errorMessageKey: "user.users.errorLoad",
  });
  if (res.ok) {
    notifications.show(t("user.users.form.success"), "success");
    showForm.value = false;
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
</style>
