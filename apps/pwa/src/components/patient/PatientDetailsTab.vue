<template>
  <div class="patient-details">
    <p v-if="consentWithdrawnAt" class="patient-details__banner" role="alert" data-testid="consent-withdrawn">
      <AppIcon name="info-circle" class="patient-details__banner-icon" />
      {{ t("app.patients.detail.consentWithdrawn", { date: formatDate(consentWithdrawnAt) }) }}
    </p>

    <!-- A: what you read in five seconds. Each tile shows only when it has something to say. -->
    <section v-if="tiles.length" class="patient-details__tiles" :aria-label="t('app.patients.detail.summaryLabel')" data-testid="summary-strip">
      <template v-for="tile in tiles" :key="tile.key">
        <component
          :is="tile.to ? RouterLink : tile.tab ? 'button' : 'div'"
          :to="tile.to"
          :type="tile.tab ? 'button' : undefined"
          class="patient-details__tile"
          :class="{ 'patient-details__tile--link': tile.tab || tile.to }"
          :data-testid="`tile-${tile.key}`"
          @click="tile.tab && emit('open-tab', tile.tab)"
        >
          <span class="patient-details__tile-key">{{ tile.label }}</span>
          <span class="patient-details__tile-value" :title="tile.value">{{ tile.value }}</span>
          <AhiScaleBar v-if="tile.ahi != null" :ahi="tile.ahi" thin class="patient-details__tile-scale" />
          <span v-if="tile.sub" class="patient-details__tile-sub">{{ tile.sub }}</span>
        </component>
      </template>
    </section>

    <!-- C: every field in a named group of label · value rows. -->
    <div class="patient-details__groups">
      <section class="patient-details__group" aria-labelledby="pd-clinical">
        <h3 id="pd-clinical" class="patient-details__group-title">{{ t("app.patients.detail.groups.clinical") }}</h3>
        <dl class="patient-details__rows">
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.ahiBaseline") }}</dt>
            <dd>{{ patient.ahi_baseline ?? "—" }}</dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.heightCm") }}</dt>
            <dd>{{ patient.height_cm != null ? t("app.patients.detail.heightValue", { cm: patient.height_cm }) : "—" }}</dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.cpapDevice") }}</dt>
            <dd>{{ patient.cpap_device ? t("app.common.yes") : t("app.common.no") }}</dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.medicalRecord") }}</dt>
            <dd>{{ patient.medical_record || "—" }}</dd>
          </div>
        </dl>
        <!-- NEO-237 D1: the latest ATM evaluation, read-only; opens its tab in the Historia clínica. -->
        <PatientTmjCard v-if="canSeeStudies" :patient-id="patient.id" @open="emit('open-study', 'tmjExam', 'document')" />
      </section>

      <section class="patient-details__group" aria-labelledby="pd-contact">
        <h3 id="pd-contact" class="patient-details__group-title">{{ t("app.patients.detail.groups.contact") }}</h3>
        <dl class="patient-details__rows">
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.phone") }}</dt>
            <dd>
              <a v-if="patient.phone" :href="`tel:${patient.phone}`" class="patient-details__link">{{ patient.phone }}</a>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.email") }}</dt>
            <dd>
              <a v-if="patient.email" :href="`mailto:${patient.email}`" class="patient-details__link">{{ patient.email }}</a>
              <span v-else>—</span>
            </dd>
          </div>
          <div v-if="summary?.preferred_name" class="patient-details__row">
            <dt>{{ t("app.patients.detail.preferredName") }}</dt>
            <dd>{{ summary.preferred_name }}</dd>
          </div>
          <div v-if="shippingAddress" class="patient-details__row">
            <dt>{{ t("app.patients.detail.shippingAddress") }}</dt>
            <dd>{{ shippingAddress }}</dd>
          </div>
        </dl>
      </section>

      <section class="patient-details__group" aria-labelledby="pd-care">
        <h3 id="pd-care" class="patient-details__group-title">{{ t("app.patients.detail.groups.care") }}</h3>
        <dl class="patient-details__rows">
          <div class="patient-details__row patient-details__row--entity">
            <dt>{{ t("app.patients.detail.practitioner") }}</dt>
            <dd>
              <EntityLink
                :to="patient.practitioner_id && canOpenHcp ? { name: 'hcp-detail', params: { id: patient.practitioner_id } } : null"
                :label="patient.practitioner_name"
                entity-type="hcp"
                :specialty="patient.practitioner_specialty"
                :details="specialtySet(patient.practitioner_specialty, patient.practitioner_specialties).details"
                :more-details="specialtySet(patient.practitioner_specialty, patient.practitioner_specialties).more"
                :avatar-size="32"
              />
            </dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.status") }}</dt>
            <dd>
              <VChip :color="patientStatusColor(patient.status)" size="small" variant="tonal">
                {{ patientStatusLabel(t, patient.status) }}
              </VChip>
            </dd>
          </div>
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.region") }}</dt>
            <dd>{{ regionBreadcrumb }}</dd>
          </div>
          <div v-if="patient.created_at" class="patient-details__row">
            <dt>{{ t("app.patients.detail.patientSince") }}</dt>
            <dd>{{ formatDate(patient.created_at) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="appointments.length" class="patient-details__group" aria-labelledby="pd-appointments">
        <h3 id="pd-appointments" class="patient-details__group-title">{{ t("app.patients.detail.groups.appointments") }}</h3>
        <dl class="patient-details__rows">
          <div
            v-for="a in appointments"
            :key="a.id"
            class="patient-details__row"
            :class="{ 'patient-details__row--muted': a.status === 'cancelled' }"
            data-testid="patient-appointment"
            :data-id="a.id"
          >
            <dt>{{ formatDayLabel(a.start_at, a.timezone, intlLocale(locale)) }}</dt>
            <dd>
              <RouterLink :to="calendarLink(a.id)" class="patient-details__link">{{ formatTimeRange(a.start_at, a.end_at, a.timezone, intlLocale(locale)) }}</RouterLink><template v-if="a.practitioner_name"> · {{ a.practitioner_name }}</template>
              <VChip v-if="a.status !== 'scheduled'" size="x-small" variant="tonal" class="ml-1">{{ t(`user.appointments.status.${a.status}`) }}</VChip>
            </dd>
          </div>
        </dl>
      </section>

      <!-- CORE-137: events (Evento) made for this patient, next to their appointments. -->
      <section v-if="events.length" class="patient-details__group" aria-labelledby="pd-events" data-testid="patient-events">
        <h3 id="pd-events" class="patient-details__group-title">{{ t("app.patients.detail.groups.events") }}</h3>
        <dl class="patient-details__rows">
          <div
            v-for="e in events"
            :key="e.id"
            class="patient-details__row"
            :class="{ 'patient-details__row--muted': e.status === 'cancelled' }"
            data-testid="patient-event"
            :data-id="e.id"
          >
            <dt>{{ formatDate(e.start_at) }}</dt>
            <dd>
              {{ formatEventTime(e.start_at) }} · {{ e.title || t("user.planner.form.fieldTitle") }} · {{ t(e.type === "video" ? "user.planner.form.typeVideo" : "user.planner.form.typeF2f") }}
              <VChip v-if="e.status !== 'scheduled'" size="x-small" variant="tonal" class="ml-1">{{ t(`user.appointments.status.${e.status}`) }}</VChip>
            </dd>
          </div>
        </dl>
      </section>

      <!-- CORE-132: every other HCP with access — specialty says who does what; when and how they got it (D1). -->
      <section v-if="teamMembers.length || careTeam.canAdd.value" class="patient-details__group" aria-labelledby="pd-team" data-testid="care-team">
        <h3 id="pd-team" class="patient-details__group-title">{{ t("app.patients.detail.groups.careTeam") }}</h3>
        <dl class="patient-details__rows">
          <div
            v-for="member in teamMembers"
            :key="member.practitioner_id"
            class="patient-details__row patient-details__row--member"
            :data-testid="`care-team-${member.practitioner_id}`"
          >
            <dt>{{ accessLine(member) }}</dt>
            <dd>
              <EntityLink
                :to="canOpenHcp ? { name: 'hcp-detail', params: { id: member.practitioner_id } } : null"
                :label="member.name"
                entity-type="hcp"
                :specialty="member.primary_specialty"
                :details="specialtySet(member.primary_specialty, member.specialties).details"
                :more-details="specialtySet(member.primary_specialty, member.specialties).more"
                :avatar-size="32"
              />
              <AppButton
                v-if="careTeam.canRemove.value"
                variant="text"
                size="small"
                icon
                :aria-label="t('app.patients.detail.careTeam.remove', { name: member.name })"
                :data-testid="`care-team-remove-${member.practitioner_id}`"
                @click="removing = member"
              >
                <AppIcon name="close" />
              </AppButton>
            </dd>
          </div>
          <div v-if="!teamMembers.length" class="patient-details__row">
            <dt>{{ t("app.patients.detail.careTeam.empty") }}</dt>
          </div>
          <div v-if="careTeam.canAdd.value" class="patient-details__row patient-details__row--add">
            <VAutocomplete
              v-if="adding"
              v-model="addPractitionerId"
              :items="addOptions"
              item-title="name"
              item-value="id"
              :label="t('app.patients.detail.careTeam.pickDoctor')"
              :loading="loadingOptions"
              variant="outlined"
              density="compact"
              hide-details
              autofocus
              class="patient-details__add-field"
              data-testid="care-team-pick"
            />
            <AppButton
              v-if="adding"
              color="primary"
              size="small"
              :disabled="!addPractitionerId"
              :loading="careTeam.saving.value"
              data-testid="care-team-add-confirm"
              @click="onAdd"
            >
              {{ t("app.patients.detail.careTeam.addConfirm") }}
            </AppButton>
            <AppButton v-else variant="text" size="small" data-testid="care-team-add" @click="openAdd">
              {{ t("app.patients.detail.careTeam.add") }}
            </AppButton>
          </div>
        </dl>
        <AppConfirmDialog
          :model-value="!!removing"
          :text="removing ? t('app.patients.detail.careTeam.removeConfirm', { name: removing.name }) : ''"
          :secondary-label="t('app.common.cancel')"
          :secondary-color="null"
          :primary-label="t('app.patients.detail.careTeam.removeAction')"
          primary-color="error"
          :loading="careTeam.saving.value"
          @update:model-value="(open: boolean) => { if (!open) removing = null; }"
          @secondary="removing = null"
          @primary="onRemove"
        />
      </section>

      <section v-if="summary?.data_consent_at" class="patient-details__group" aria-labelledby="pd-admin">
        <h3 id="pd-admin" class="patient-details__group-title">{{ t("app.patients.detail.groups.admin") }}</h3>
        <dl class="patient-details__rows">
          <div class="patient-details__row">
            <dt>{{ t("app.patients.detail.dataConsent") }}</dt>
            <dd>{{ formatDate(summary.data_consent_at) }}</dd>
          </div>
        </dl>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reportCaught, reportFailedResponse } from "@api";
import { computed, onMounted, ref, toRef, watch } from "vue";
import { RouterLink, useRouter, type RouteLocationRaw } from "vue-router";
import { useI18n } from "vue-i18n";
import { VAutocomplete, VChip } from "vuetify/components";
import { intlLocale } from "@i18n/language-options";
import AhiScaleBar from "../AhiScaleBar.vue";
import AppButton from "../AppButton.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import AppIcon from "../AppIcon.vue";
import PatientTmjCard from "./PatientTmjCard.vue";
import { onPatientChecklistUpdated, type ChecklistCategory } from "../../composables/usePatientChecklist";
import { onPatientChanged } from "../../composables/usePatientChanged";
import { useVisiblePolling } from "../../composables/useVisiblePolling";
import { useAuthStore } from "../../stores/auth";
import EntityLink from "../EntityLink.vue";
import { apiFetch } from "../../composables/useApi";
import { usePatientCareTeam, type CareTeamMember } from "../../composables/usePatientCareTeam";
import { useIdentity } from "../../composables/useIdentity";
import { formatDiagnosis } from "../../utils/diagnosis";
import { deviceOrderState } from "../../utils/treatmentPlanStatus";
import { patientStatusColor, patientStatusLabel } from "../../utils/patientStatus";
import { fromEncounter, type PlannerEvent } from "../../utils/encounterMapping";
import { formatDayLabel, formatTimeRange } from "../../utils/appointmentTime";
import type { PatientDetailsTabPatient, PatientSummary } from "./patientSummary";

/**
 * The patient's Detalles tab (NEO-206, layout decided in NEO-205): a summary
 * strip (diagnosis, latest PSG, device order, next appointment) over grouped
 * label · value rows. The documents checklist is not here — it lives in the
 * side panel and on Documentos. The strip and the extra rows come from
 * GET /patient/:id/summary; until it answers (or if it fails) the base rows
 * still show. The PSG comes back only for admin/doctor/manager.
 */
interface Tile {
  key: "diagnosis" | "psg" | "treatment" | "appointment";
  label: string;
  value: string;
  sub?: string;
  ahi?: number;
  /** Clicking the tile opens this tab. */
  tab?: string;
  /** …or this route (the next visit, in the calendar). */
  to?: RouteLocationRaw;
}

const props = defineProps<{
  patient: PatientDetailsTabPatient;
  /** Diagnosis is health data — same roles as Documentos/Estudios (NEO-83). */
  canSeeStudies: boolean;
  /** Details is the open tab — tabs stay mounted (NEO-153), so coming back to it reloads. */
  active?: boolean;
}>();
const emit = defineEmits<{ "open-tab": [tab: string]; "open-study": [itemKey: string, category: ChecklistCategory] }>();

const { t, locale } = useI18n();
const { specialtySet } = useIdentity();
const router = useRouter();
const authStore = useAuthStore();

/** HCP names link only for roles the HCP record is open to (a doctor has none) — read from the route itself. */
const canOpenHcp = computed(() => {
  const roles = router.resolve({ name: "hcp-detail", params: { id: "_" } }).meta.roles as string[] | undefined;
  return !roles || roles.includes(authStore.user?.role ?? "");
});
const calendarLink = (appointmentId: string): RouteLocationRaw => ({ name: "calendar", query: { appointment: appointmentId } });

const summary = ref<PatientSummary | null>(null);

interface PatientAppointment {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  timezone: string;
  practitioner_name?: string | null;
}
const appointmentItems = ref<PatientAppointment[]>([]);
const eventItems = ref<PlannerEvent[]>([]);

async function load(): Promise<void> {
  const id = props.patient.id;
  try {
    const res = await apiFetch(`/api/v1/patient/${id}/summary`, { handleErrors: false });
    if (id !== props.patient.id) return;
    if (res.ok) summary.value = (await res.json()) as PatientSummary;
    else await reportFailedResponse(res, { where: "PatientDetailsTab.summary", path: "/api/v1/patient/:id/summary" });
  } catch (err) {
    reportCaught(err, { where: "PatientDetailsTab.summary" });
  }
}

/** Every appointment of the patient, not only the next one (CORE-133). */
async function loadAppointments(): Promise<void> {
  const id = props.patient.id;
  try {
    const res = await apiFetch(`/api/v1/appointments?patient_id=${id}`, { handleErrors: false });
    if (id !== props.patient.id || !res.ok) return;
    appointmentItems.value = ((await res.json()) as { items?: PatientAppointment[] }).items ?? [];
  } catch (err) {
    reportCaught(err, { where: "PatientDetailsTab.appointments" });
  }
}

/** Events (encounters) made for the patient (CORE-137). */
async function loadEvents(): Promise<void> {
  const id = props.patient.id;
  try {
    const res = await apiFetch(`/api/v1/encounter?patient_id=${id}`, { handleErrors: false });
    if (id !== props.patient.id || !res.ok) return;
    const rows = ((await res.json()) as { items?: Parameters<typeof fromEncounter>[0][] }).items ?? [];
    eventItems.value = rows.map(fromEncounter);
  } catch (err) {
    reportCaught(err, { where: "PatientDetailsTab.events" });
  }
}

const careTeam = usePatientCareTeam(toRef(() => props.patient.id));
/** The primary doctor has their own row in "care"; this group lists everyone else. */
const teamMembers = computed(() => careTeam.members.value.filter((m) => !m.primary));
/** "Via a visit · Since 4 Oct 2026 · Ana" — how, since when and by whom the HCP got access (D1). */
function accessLine(member: CareTeamMember): string {
  const how = t(`app.patients.detail.careTeam.source.${member.source ?? "manual"}`);
  if (!member.added_at) return how;
  const since = member.added_by_name
    ? t("app.patients.detail.careTeam.sinceBy", { date: formatDate(member.added_at), name: member.added_by_name })
    : t("app.patients.detail.careTeam.since", { date: formatDate(member.added_at) });
  return `${how} · ${since}`;
}
const removing = ref<CareTeamMember | null>(null);
const adding = ref(false);
const addPractitionerId = ref<string | null>(null);
const allPractitioners = ref<{ id: string; name: string }[]>([]);
const loadingOptions = ref(false);
const addOptions = computed(() => {
  const taken = new Set(careTeam.members.value.map((m) => m.practitioner_id));
  if (props.patient.practitioner_id) taken.add(props.patient.practitioner_id);
  return allPractitioners.value.filter((p) => !taken.has(p.id));
});

async function openAdd(): Promise<void> {
  adding.value = true;
  addPractitionerId.value = null;
  if (allPractitioners.value.length) return;
  loadingOptions.value = true;
  try {
    const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
    if (res.ok) allPractitioners.value = ((await res.json()) as { items?: { id: string; name: string }[] }).items ?? [];
  } catch (err) {
    reportCaught(err, { where: "PatientDetailsTab.practitioners" });
  } finally {
    loadingOptions.value = false;
  }
}

async function onAdd(): Promise<void> {
  if (!addPractitionerId.value) return;
  if (await careTeam.add(addPractitionerId.value)) {
    adding.value = false;
    addPractitionerId.value = null;
  }
}

async function onRemove(): Promise<void> {
  if (!removing.value) return;
  if (await careTeam.remove(removing.value.practitioner_id)) removing.value = null;
}

/**
 * Reloads what Details shows while keeping it on screen: every loader only
 * replaces its data on success, so a failed refresh leaves the old values.
 */
async function refresh(): Promise<void> {
  await Promise.all([load(), loadAppointments(), loadEvents(), careTeam.load()]);
}

/** Fingerprint of the card (GET /patient/:id/version) — compared to know when someone else changed it. */
let version: string | null = null;
async function fetchVersion(): Promise<string | null> {
  const res = await apiFetch(`/api/v1/patient/${props.patient.id}/version`, { handleErrors: false });
  return res.ok ? ((await res.json()) as { version: string }).version : null;
}
async function refreshIfChanged(): Promise<void> {
  try {
    const next = await fetchVersion();
    if (!next || next === version) return;
    version = next;
    await refresh();
  } catch (err) {
    reportCaught(err, { where: "PatientDetailsTab.refreshIfChanged", level: "warn" });
  }
}

onMounted(async () => {
  await refresh();
  // benign: without a baseline the first poll only records the fingerprint.
  version = await fetchVersion().catch(() => null);
});
// A visit booked or the record edited on this card; a study or document saved (NEO-173).
onPatientChanged(() => props.patient.id, () => void refresh());
onPatientChecklistUpdated(() => props.patient.id, () => void load());
watch(() => props.active, (active, was) => {
  if (active && was === false) void refresh();
});
// Someone else changed the patient: checked every minute while visible and on return to the app.
useVisiblePolling(() => (props.active === false ? null : 60_000), refreshIfChanged);
watch(
  () => props.patient.id,
  () => {
    summary.value = null;
    appointmentItems.value = [];
    eventItems.value = [];
    careTeam.members.value = [];
    adding.value = false;
    version = null;
    void load();
    void loadAppointments();
    void loadEvents();
    void careTeam.load();
  },
);

/** Upcoming soonest first, then past most recent first. */
const appointments = computed(() => {
  const now = Date.now();
  const at = (a: PatientAppointment) => new Date(a.start_at).getTime();
  const upcoming = appointmentItems.value.filter((a) => at(a) >= now).sort((a, b) => at(a) - at(b));
  const past = appointmentItems.value.filter((a) => at(a) < now).sort((a, b) => at(b) - at(a));
  return [...upcoming, ...past];
});

/** Upcoming soonest first, then past most recent first (same order as appointments). */
const events = computed(() => {
  const now = Date.now();
  const at = (e: PlannerEvent) => new Date(e.start_at).getTime();
  const upcoming = eventItems.value.filter((e) => at(e) >= now).sort((a, b) => at(a) - at(b));
  const past = eventItems.value.filter((e) => at(e) < now).sort((a, b) => at(b) - at(a));
  return [...upcoming, ...past];
});
function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(intlLocale(locale.value), { hour: "numeric", minute: "2-digit" });
}

const numberFormat = computed(() => new Intl.NumberFormat(intlLocale(locale.value), { maximumFractionDigits: 1 }));
const fmt = (n: number) => numberFormat.value.format(n);

/** A plain YYYY-MM-DD is a calendar day: read it as local noon so no time zone moves it to the day before. */
function formatDate(value: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString(intlLocale(locale.value), opts);
}

const regionBreadcrumb = computed(() => {
  const path = props.patient.territory_path;
  if (path && path.length > 0) return path.map((node) => (node.code || node.name).toLowerCase()).join("/");
  return props.patient.region || "—";
});

const shippingAddress = computed(() => {
  const address = summary.value?.shipping_address;
  if (!address) return null;
  const parts = [address.line1, address.city, address.postal_code].filter((part): part is string => typeof part === "string" && part.trim() !== "");
  return parts.length ? parts.join(", ") : null;
});

const consentWithdrawnAt = computed(() => summary.value?.data_consent_withdrawn_at ?? null);

const tiles = computed<Tile[]>(() => {
  const out: Tile[] = [];
  const study = summary.value?.latest_study ?? null;

  const diagnosis = props.canSeeStudies ? formatDiagnosis(props.patient.diagnosis_code ?? study?.diagnosis_code ?? null) : null;
  if (diagnosis) out.push({ key: "diagnosis", label: t("app.patients.detail.summary.diagnosis"), value: diagnosis });

  if (study?.ahi_score != null) {
    const sub = [
      study.spo2_nadir != null ? `SpO₂ ${fmt(study.spo2_nadir)} %` : null,
      study.odi != null ? `ODI ${fmt(study.odi)}` : null,
    ].filter(Boolean).join(" · ");
    out.push({
      key: "psg",
      label: study.study_date
        ? t("app.patients.detail.summary.psg", { date: formatDate(study.study_date, { day: "numeric", month: "short" }) })
        : t("app.patients.detail.summary.psgNoDate"),
      value: t("app.patients.detail.summary.perHour", { n: fmt(study.ahi_score) }),
      ahi: study.ahi_score,
      sub: sub || undefined,
      tab: "studies",
    });
  }

  const order = summary.value?.device_order ?? null;
  if (order) {
    const state = deviceOrderState(order);
    if (state !== "cancelled") {
      out.push({
        key: "treatment",
        label: t("app.patients.detail.summary.treatment"),
        value: t("app.patients.detail.summary.oralAppliance"),
        sub: t(`app.deviceOrder.state.${state}`),
        tab: "orthoapnea",
      });
    }
  }

  // The next scheduled visit from the full list knows its clinic's zone; the
  // summary's bare instant is only the fallback until the list loads (CORE-133).
  const now = Date.now();
  const listed = appointments.value.find((a) => a.status === "scheduled" && new Date(a.start_at).getTime() >= now);
  const visit = listed ?? summary.value?.next_appointment ?? null;
  if (visit) {
    const start = new Date(visit.start_at);
    const timeZone = listed?.timezone;
    out.push({
      key: "appointment",
      label: t("app.patients.detail.summary.nextAppointment"),
      value: start.toLocaleDateString(intlLocale(locale.value), { day: "numeric", month: "short", timeZone }),
      sub: start.toLocaleTimeString(intlLocale(locale.value), { hour: "2-digit", minute: "2-digit", timeZone }),
      to: calendarLink(visit.id),
    });
  }
  return out;
});
</script>

<style scoped>
/* Container queries, not media queries: the tab column is 720px wide next to
   the side panel and full width on a tablet — the layout follows the column. */
.patient-details {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
}

.patient-details__banner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  margin: 0;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-error), 0.1);
  color: rgb(var(--v-theme-error));
  font-size: 0.875rem;
}
.patient-details__banner-icon {
  flex: none;
}

/* Two tiles per row on a phone, four from 560px of column. */
.patient-details__tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2, 8px);
}
@container (min-width: 560px) {
  .patient-details__tiles {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.patient-details__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--space-3, 12px);
  border: none;
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: inherit;
  font: inherit;
  text-align: left;
}
.patient-details__tile--link {
  cursor: pointer;
  text-decoration: none;
  transition: background-color 150ms ease;
}
.patient-details__tile--link:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
}
/* Inset, like the tabs: never clipped by a parent. */
.patient-details__tile--link:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}

.patient-details__tile-key {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.patient-details__tile-value {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  /* A long ICD-10 label stops at three lines; the full text is in the tooltip. */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.patient-details__tile-scale {
  margin: var(--space-1, 4px) 0 2px;
}
.patient-details__tile-sub {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* One column on a phone, two from 640px of column; a group never splits. */
.patient-details__groups {
  columns: 1;
  column-gap: var(--space-6, 24px);
}
@container (min-width: 640px) {
  .patient-details__groups {
    columns: 2;
  }
}

.patient-details__group {
  break-inside: avoid;
  margin-bottom: var(--space-4, 16px);
}
.patient-details__group-title {
  margin: 0 0 var(--space-1, 4px) 2px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-details__rows {
  margin: 0;
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}
.patient-details__row--muted {
  opacity: 0.6;
}

.patient-details__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  min-height: 40px;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  font-size: 0.875rem;
}
.patient-details__row + .patient-details__row {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
.patient-details__row dt {
  flex: none;
  max-width: 50%;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.patient-details__row dd {
  min-width: 0;
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
/* The doctor's avatar + name + specialty: keep it a right-aligned block. */
.patient-details__row--entity dd {
  display: flex;
  justify-content: flex-end;
}

/* Care team (CORE-132): the doctor (+ remove) on top, full width; how and since when underneath. */
.patient-details__row--member {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-1, 4px);
}
.patient-details__row--member dd {
  order: -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1, 4px);
  text-align: left;
}
.patient-details__row--member dt {
  max-width: none;
  font-size: 0.75rem;
}
.patient-details__row--add {
  justify-content: flex-end;
}
.patient-details__add-field {
  flex: 1;
  min-width: 0;
}

.patient-details__link {
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}
</style>
