<template>
  <div class="patient-appointment">
    <PatientTopBar
      :first-name="null"
      :clinic="appointment?.clinic_name ?? ''"
      :clinic-email="appointment?.contact_email ?? null"
      :clinic-phone="appointment?.contact_phone ?? null"
      privacy-url=""
      website-url=""
    />

    <AuthCard class="patient-appointment__card" :title="t('publicAppointment.title')" :loading="phase === 'loading' || busy">
      <div v-if="phase === 'loading'" class="patient-appointment__body">
        <AppLoadingState />
      </div>

      <div v-else-if="phase === 'invalid'" class="patient-appointment__body" role="alert">
        <p>{{ t("publicAppointment.invalid") }}</p>
      </div>

      <div v-else-if="phase === 'unreachable' || !appointment" class="patient-appointment__body" role="alert">
        <p>{{ t("publicAppointment.error") }}</p>
        <AppButton color="primary" size="large" block @click="load">{{ t("app.errorState.refresh") }}</AppButton>
      </div>

      <div v-else class="patient-appointment__body">
        <AppInlineAlert v-if="appointment.status === 'cancelled'" type="warning" :text="t('publicAppointment.cancelled')" class="patient-appointment__alert" />
        <AppInlineAlert v-else-if="!open" type="info" :text="t('publicAppointment.past')" class="patient-appointment__alert" />

        <dl class="patient-appointment__details" :class="{ 'patient-appointment__details--cancelled': appointment.status === 'cancelled' }" data-testid="appointment-details">
          <div><dt>{{ t("publicAppointment.date") }}</dt><dd>{{ when.date }}</dd></div>
          <div><dt>{{ t("publicAppointment.time") }}</dt><dd>{{ when.time }}</dd></div>
          <div v-if="appointment.clinic_name"><dt>{{ t("publicAppointment.clinic") }}</dt><dd>{{ appointment.clinic_name }}</dd></div>
          <div v-if="appointment.clinic_address"><dt>{{ t("publicAppointment.address") }}</dt><dd>{{ appointment.clinic_address }}</dd></div>
          <div v-if="appointment.doctor_name"><dt>{{ t("publicAppointment.doctor") }}</dt><dd>{{ appointment.doctor_name }}</dd></div>
        </dl>

        <template v-if="open">
          <div v-if="appointment.patient_response && !changing" class="patient-appointment__answer" role="status" data-testid="appointment-answer">
            <AppIcon :name="appointment.patient_response === 'confirmed' ? 'check-circle' : 'x-circle'" class="patient-appointment__answer-icon" />
            <p>{{ appointment.patient_response === "confirmed" ? t("publicAppointment.confirmed") : t("publicAppointment.cannotAttendDone") }}</p>
            <button type="button" class="patient-appointment__link" @click="changing = true">{{ t("publicAppointment.changeAnswer") }}</button>
          </div>
          <div v-else class="patient-appointment__ask">
            <p class="patient-appointment__question">{{ t("publicAppointment.askConfirm") }}</p>
            <AppButton
              color="primary"
              size="large"
              block
              data-testid="appointment-confirm"
              :variant="intent === 'cannot' ? 'tonal' : 'flat'"
              :disabled="busy"
              @click="respond('confirmed')"
            >{{ t("publicAppointment.confirm") }}</AppButton>
            <AppButton
              color="primary"
              size="large"
              block
              data-testid="appointment-cannot"
              :variant="intent === 'cannot' ? 'flat' : 'tonal'"
              :disabled="busy"
              @click="respond('cannot_attend')"
            >{{ t("publicAppointment.cannotAttend") }}</AppButton>
          </div>
        </template>

        <AppInlineAlert v-if="actionError" type="error" :text="t('publicAppointment.error')" class="patient-appointment__alert" />

        <div v-if="appointment.contact_phone || appointment.contact_email" class="patient-appointment__contact">
          <p>{{ t("publicAppointment.changeLead") }}</p>
          <a v-if="appointment.contact_phone" :href="`tel:${telHref(appointment.contact_phone)}`" class="patient-appointment__contact-link">
            <AppIcon name="phone" /> {{ appointment.contact_phone }}
          </a>
          <a v-if="appointment.contact_email" :href="`mailto:${appointment.contact_email}`" class="patient-appointment__contact-link">
            <AppIcon name="mail" /> {{ appointment.contact_email }}
          </a>
        </div>

        <div class="patient-appointment__opt-out">
          <p v-if="appointment.opted_out" role="status" data-testid="appointment-opted-out">{{ t("publicAppointment.optOutDone") }}</p>
          <div v-else-if="optOutOpen" class="patient-appointment__opt-out-panel">
            <p class="patient-appointment__opt-out-title">{{ t("publicAppointment.optOutTitle") }}</p>
            <p>{{ t("publicAppointment.optOutBody") }}</p>
            <AppButton variant="tonal" color="error" block data-testid="appointment-opt-out" :disabled="busy" @click="optOut">{{ t("publicAppointment.optOutConfirm") }}</AppButton>
          </div>
          <button v-else type="button" class="patient-appointment__link patient-appointment__link--quiet" @click="optOutOpen = true">{{ t("publicAppointment.optOutLink") }}</button>
        </div>
      </div>
    </AuthCard>
  </div>
</template>

<script setup lang="ts">
import { reportFailedResponse } from "@api";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { AuthCard, AppInlineAlert } from "@ui";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import PatientTopBar from "../components/questionnaire/PatientTopBar.vue";
import { apiFetch } from "../composables/useApi";

/**
 * The patient's appointment page (CORE-25), opened from the appointment
 * email: see when and where, confirm or say "I can't come" (the clinic is
 * told), or stop appointment emails. No account — the token in the
 * #fragment is the key and never reaches a server log. ?r= only says which
 * email button was pressed; nothing is sent until the patient taps here,
 * so mail scanners that open links can't answer for them.
 */
type Response = "confirmed" | "cannot_attend";

interface PublicAppointment {
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  past: boolean;
  start_at: string;
  end_at: string;
  timezone: string;
  clinic_name: string | null;
  clinic_address: string | null;
  doctor_name: string | null;
  online_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  patient_response: Response | null;
  opted_out: boolean;
  locale: string;
}

const DATE_LOCALES: Record<string, string> = { en: "en-GB", pl: "pl-PL", mx: "es-MX" };

const route = useRoute();
const { t, locale } = useI18n();

const token = computed(() => route.hash.replace(/^#/, ""));
const intent = computed(() => (typeof route.query.r === "string" ? route.query.r : null));

const phase = ref<"loading" | "invalid" | "unreachable" | "ready">("loading");
const appointment = ref<PublicAppointment | null>(null);
const busy = ref(false);
const changing = ref(false);
const actionError = ref(false);
const optOutOpen = ref(intent.value === "stop");

const open = computed(() => appointment.value?.status === "scheduled" && !appointment.value.past);

const when = computed(() => {
  const a = appointment.value;
  if (!a) return { date: "", time: "" };
  const intlLocale = DATE_LOCALES[locale.value as string] ?? "es-MX";
  const date = new Intl.DateTimeFormat(intlLocale, { timeZone: a.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(a.start_at));
  const clock = new Intl.DateTimeFormat(intlLocale, { timeZone: a.timezone, hour: "2-digit", minute: "2-digit" });
  return { date, time: `${clock.format(new Date(a.start_at))} – ${clock.format(new Date(a.end_at))}` };
});

function telHref(phone: string): string {
  return phone.replace(/[^0-9+]/g, "");
}

function post(path: "lookup" | "respond" | "opt-out", body: Record<string, unknown> = {}): Promise<globalThis.Response> {
  return apiFetch(`/api/v1/public/appointment/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.value, ...body }),
    handleErrors: false,
  });
}

async function load() {
  if (!token.value) {
    phase.value = "invalid";
    return;
  }
  phase.value = "loading";
  try {
    const res = await post("lookup");
    if (res.status === 410) {
      phase.value = "invalid";
      return;
    }
    if (!res.ok) {
      await reportFailedResponse(res, { where: "PatientAppointmentView.load" });
      phase.value = "unreachable";
      return;
    }
    appointment.value = (await res.json()) as PublicAppointment;
    phase.value = "ready";
  } catch {
    phase.value = "unreachable";
  }
}

async function act(path: "respond" | "opt-out", body: Record<string, unknown> = {}): Promise<boolean> {
  busy.value = true;
  actionError.value = false;
  try {
    const res = await post(path, body);
    if (res.status === 410) {
      phase.value = "invalid";
      return false;
    }
    if (res.status === 409) {
      await load(); // cancelled or moved meanwhile — show what it is now
      return false;
    }
    if (!res.ok) {
      await reportFailedResponse(res, { where: `PatientAppointmentView.${path}` });
      actionError.value = true;
      return false;
    }
    appointment.value = (await res.json()) as PublicAppointment;
    return true;
  } catch {
    actionError.value = true;
    return false;
  } finally {
    busy.value = false;
  }
}

async function respond(response: Response) {
  if (await act("respond", { response })) changing.value = false;
}

async function optOut() {
  if (await act("opt-out")) optOutOpen.value = false;
}

onMounted(load);
</script>

<style scoped>
.patient-appointment {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow-y: auto;
  padding: 0 0 40px;
}

.patient-appointment__card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 560px;
  margin-top: clamp(16px, 6vh, 56px);
}

.patient-appointment__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 24px 28px;
}

.patient-appointment__alert {
  margin: 0;
}

.patient-appointment__details {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 16px;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.patient-appointment__details > div {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 12px;
}

.patient-appointment__details dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-appointment__details dd {
  margin: 0;
  font-weight: 600;
}

.patient-appointment__details--cancelled dd {
  text-decoration: line-through;
}

.patient-appointment__question {
  margin: 0 0 4px;
  font-weight: 600;
}

.patient-appointment__ask {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patient-appointment__answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.patient-appointment__answer p {
  margin: 0;
}

.patient-appointment__answer-icon {
  font-size: 40px;
  color: rgb(var(--v-theme-primary));
}

.patient-appointment__contact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.patient-appointment__contact p {
  margin: 0 0 4px;
}

.patient-appointment__contact-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-decoration: none;
}

.patient-appointment__opt-out {
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-appointment__opt-out p {
  margin: 0 0 8px;
}

.patient-appointment__opt-out-title {
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.patient-appointment__link {
  align-self: center;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.patient-appointment__link--quiet {
  color: inherit;
}
</style>
