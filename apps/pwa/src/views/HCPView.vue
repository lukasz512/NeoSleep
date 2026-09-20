<template>
  <div class="hcp-view">
    <FormRenderer
      v-model="showAddModal"
      :fields="hcpFormFields"
      :derive="hcpFormDerive"
      title-key="user.hcp.form.title"
      submit-label-key="user.hcp.form.submit"
      avatar-entity-type="hcp"
      @submit="onContactSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="hcpFormFields"
      :derive="hcpFormDerive"
      :initial-data="selectedHcpFormData"
      title-key="user.hcp.form.title"
      edit-title-key="user.hcp.form.editTitle"
      submit-label-key="user.hcp.form.submit"
      edit-submit-label-key="user.hcp.form.editSubmit"
      avatar-entity-type="hcp"
      @submit="onEditSubmit"
    />
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <!-- Reps still add HCPs only through the lead -> invite-to-partner / move-to-doctors pipeline (see LeadDetailView.vue) -->
    <AppEntityList
      view-id="hcp"
      api-endpoint="/api/v1/practitioner"
      :headers="tableHeaders"
      :filter-definitions="hcpFilterDefinitions"
      :i18n="hcpI18n"
      :show-add-button="canAdd"
      detail-route-name="hcp-detail"
      :filter-param-keys="['specialty', 'institution', 'region']"
      @add="onAddContact"
    >
    <template #item.name="{ item }">
      <span class="hcp-name-cell">
        <AppAvatar :name="(item as HCPListItem).name" :first-name="(item as HCPListItem).first_name" :last-name="(item as HCPListItem).last_name" entity-type="hcp" :size="32" />
        {{ (item as { name?: string }).name }}
      </span>
    </template>
    <template #item.specialty="{ item }">
      {{ specialtyLabel((item as HCPListItem).specialty) }}
    </template>
    <template #item.institution="{ item }">
      <EntityLink
        :to="(item as HCPListItem).organization_id ? { name: 'hco-detail', params: { id: (item as HCPListItem).organization_id } } : null"
        :label="(item as HCPListItem).institution"
      />
    </template>
    <template #item.region="{ item }">
      {{ (item as HCPListItem).territory_name || (item as HCPListItem).region || "—" }}
    </template>
    <template #feed-card-avatar="{ item }">
      <AppAvatar :name="(item as HCPListItem).name" :first-name="(item as HCPListItem).first_name" :last-name="(item as HCPListItem).last_name" entity-type="hcp" :size="55" />
    </template>
    <template #feed-card-title="{ item }">
      <span class="hcp-name-cell">
        {{ (item as { name?: string }).name }}
      </span>
    </template>
    <template #feed-card-meta="{ item }">
      {{ hcpCardMeta(item as HCPListItem) }}
    </template>
    <template #feed-card-status="{ item }">
      <VChip size="x-small" variant="tonal" color="primary" class="hcp-specialty-chip">
        <template #prepend>
          <AppIcon :name="practitionerSpecialtyIcon((item as HCPListItem).specialty)" class="hcp-specialty-chip__icon" />
        </template>
        {{ specialtyLabel((item as HCPListItem).specialty) }}
      </VChip>
    </template>
    <template #feed-card-actions="{ item }">
      <AppListItemMenu :aria-label="t('app.common.moreActions')">
        <VListItem :title="t('user.detail.scheduleVisit')" @click="onScheduleVisit(item as HCPListItem)">
          <template #prepend><AppIcon :name="entityActionIcon('scheduleVisit')" :class="entityActionMenuIconClass('scheduleVisit')" /></template>
        </VListItem>
        <VListItem v-if="canEditPractitioners" :title="t('user.hcp.detail.edit')" @click="onEditContact(item as HCPListItem)">
          <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
        </VListItem>
      </AppListItemMenu>
    </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";
import EntityLink from "../components/EntityLink.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { apiFetch } from "../composables/useApi";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../composables/usePermissions";
import { useConfigStore } from "../stores/config";
import { hcpFormFields, hcpFormDerive, resolveOrganizationIdForSubmit } from "../config/forms/hcpForm";
import { practitionerSpecialtyIcon } from "../utils/hcpLabels";
import { hcpCardMeta } from "../utils/mobileCardMeta";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface HCPListItem {
  id: string;
  name?: string;
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  primary_specialty?: string;
  specialty?: string;
  organization_id?: string | null;
  institution?: string;
  region?: string;
  territory_name?: string | null;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
}

const { t } = useI18n();
const configStore = useConfigStore();
const authStore = useAuthStore();
// Direct add is its own, narrower admin/manager-only path — reps/kam/msl still
// add HCPs only through the lead pipeline (see the AppEntityList comment above).
const canAdd = computed(() => authStore.user?.role === "admin" || authStore.user?.role === "manager");
const { canEditPractitioners } = usePermissions();
const showAddModal = ref(false);
const showEditModal = ref(false);
const showEventForm = ref(false);
const selectedHcp = ref<HCPListItem | null>(null);
const eventFormInitial = ref<{ start_at: string; end_at: string; hcpIds?: string[] } | undefined>(undefined);
const { submit } = useEntitySubmit();

/** Stable reference — see HCPDetailView.vue's identical computed for why an
 *  inline object literal would silently reset FormRenderer's open form. */
const selectedHcpFormData = computed(() => (selectedHcp.value ? {
  id: selectedHcp.value.id,
  salutation: selectedHcp.value.salutation ?? "",
  first_name: selectedHcp.value.first_name ?? "",
  last_name: selectedHcp.value.last_name ?? "",
  email: selectedHcp.value.email ?? "",
  phone: selectedHcp.value.phone ?? "",
  primary_specialty: selectedHcp.value.primary_specialty ?? selectedHcp.value.specialty ?? "",
  organization_id: selectedHcp.value.organization_id ?? "",
  region: selectedHcp.value.region ?? "",
  influence_tier: selectedHcp.value.influence_tier ?? "A",
  language: selectedHcp.value.language ?? "",
  national_ids: selectedHcp.value.national_ids ?? null,
  social_links: selectedHcp.value.social_links ?? null,
} : undefined));

const hcpFilterDefs: FilterDefinition[] = [
  { key: "specialty", labelKey: "user.hcp.filters.specialty", type: "select", default: "" },
  { key: "institution", labelKey: "user.hcp.filters.institution", type: "select", default: "" },
  { key: "region", labelKey: "user.hcp.filters.region", type: "select", default: "" },
];

const specialtyOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.specialtyItems,
]);
const institutionOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.institutionTypeItems,
]);
const regionOptions = computed(() => [
  { title: t("user.leads.filters.all"), value: "" },
  ...configStore.regionItems,
]);

const hcpFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...hcpFilterDefs[0], options: specialtyOptions.value },
  { ...hcpFilterDefs[1], options: institutionOptions.value },
  { ...hcpFilterDefs[2], options: regionOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.hcp.table.name"), key: "name", sortable: true },
  { title: t("user.hcp.table.specialty"), key: "specialty", sortable: true },
  { title: t("user.hcp.table.institution"), key: "institution", sortable: true },
  { title: t("user.hcp.table.region"), key: "region", sortable: true },
]);

/** Resolves a specialty code (`hcp.specialty`) to its translated label via the
 *  same key→label vocabulary the filter dropdown already uses — previously
 *  only the filter went through this lookup, the table/card rendered the raw
 *  code. */
function specialtyLabel(code?: string): string {
  if (!code) return "—";
  return configStore.specialtyItems.find((o) => o.value === code)?.title ?? code;
}

const hcpI18n = computed(() => ({
  searchPlaceholder: "user.hcp.searchPlaceholder",
  filtersTitle: "user.hcp.filters.title",
  filtersClear: "user.hcp.filters.clear",
  add: "user.hcp.add",
  emptyTitle: "user.hcp.emptyTitle",
  emptySubtitle: "user.hcp.emptySubtitle",
  noResultsForCriteria: "user.hcp.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.hcp.noResultsForCriteriaSubtitle",
  tableNoResults: "user.hcp.table.noResults",
  errorLoad: "user.hcp.errorLoad",
}));

function onAddContact() {
  showAddModal.value = true;
}

async function onContactSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  await submit(
    {
      request: async () => {
        const organizationId = await resolveOrganizationIdForSubmit(data);
        if (organizationId === undefined) return { ok: false };
        return apiFetch("/api/v1/practitioner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, organization_id: organizationId, new_organization: undefined }),
        });
      },
      successMessage: t("user.hcp.form.success"),
      errorMessage: t("user.hcp.form.errorSave"),
    },
    done,
  );
}

function onEditContact(hcp: HCPListItem) {
  selectedHcp.value = hcp;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedHcp.value?.id;
  if (!id) { done(false); return; }
  await submit(
    {
      request: async () => {
        const organizationId = await resolveOrganizationIdForSubmit(data);
        if (organizationId === undefined) return { ok: false };
        return apiFetch(`/api/v1/practitioner/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, organization_id: organizationId, new_organization: undefined }),
        });
      },
      successMessage: t("user.hcp.form.editSuccess"),
      errorMessage: t("user.hcp.form.errorSave"),
    },
    done,
  );
}

function onScheduleVisit(hcp: HCPListItem) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  eventFormInitial.value = {
    start_at: new Date(`${date} 09:00`).toISOString(),
    end_at: new Date(`${date} 10:00`).toISOString(),
    hcpIds: hcp.id ? [hcp.id] : [],
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
  await submit(
    {
      request: () =>
        apiFetch("/api/v1/encounter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
        }),
      successMessage: t("user.planner.form.success"),
      errorMessage: t("user.planner.form.errorSave"),
      refresh: false,
    },
    done,
  );
}
</script>

<style scoped>
.hcp-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hcp-specialty-chip__icon {
  width: 14px;
  height: 14px;
}
</style>
