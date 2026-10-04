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

        <!-- CORE-116: on a phone the question (or the thank-you + calendar) comes first; the details follow. -->
        <p v-if="open" class="patient-appointment__when" data-testid="appointment-when">{{ when.date }} · {{ when.time }}</p>

        <template v-if="open">
          <!-- CORE-116: "Yes" → thank you → step 2, add to calendar. -->
          <section v-if="appointment.patient_response === 'confirmed' && !changing" class="patient-appointment__done" role="status" data-testid="appointment-answer">
            <ol class="patient-appointment__steps" aria-hidden="true">
              <li class="patient-appointment__step patient-appointment__step--done"><AppIcon name="check" /> {{ t("publicAppointment.stepConfirm") }}</li>
              <li class="patient-appointment__step patient-appointment__step--current"><span>2</span> {{ t("publicAppointment.stepCalendar") }}</li>
            </ol>
            <div class="patient-appointment__thanks" data-testid="appointment-thanks">
              <span class="patient-appointment__thanks-badge"><AppIcon name="check" /></span>
              <h2>{{ t("publicAppointment.thanksTitle") }}</h2>
              <p>{{ t("publicAppointment.thanksBody") }}</p>
            </div>
            <div v-if="appointment.calendar" class="patient-appointment__calendar" data-testid="appointment-calendar">
              <div class="patient-appointment__calendar-head">
                <AppIcon name="calendar" class="patient-appointment__calendar-icon" />
                <div>
                  <h3>{{ t("publicAppointment.calendarTitle") }}</h3>
                  <p>{{ t("publicAppointment.calendarBody") }}</p>
                </div>
              </div>
              <component
                :is="targets.primary.kind === 'ics' ? 'button' : 'a'"
                v-bind="targetAttrs(targets.primary)"
                class="patient-appointment__calendar-primary"
                data-testid="calendar-primary"
                @click="onTarget(targets.primary)"
              >
                <span>{{ t(targets.primary.labelKey) }}</span>
                <small v-if="targets.primary.hintKey">{{ t(targets.primary.hintKey) }}</small>
              </component>
              <p class="patient-appointment__calendar-others-title">{{ t("publicAppointment.calendarOthers") }}</p>
              <div class="patient-appointment__calendar-others">
                <component
                  :is="target.kind === 'ics' ? 'button' : 'a'"
                  v-for="target in targets.others"
                  :key="target.kind"
                  v-bind="targetAttrs(target)"
                  class="patient-appointment__calendar-other"
                  @click="onTarget(target)"
                >{{ t(target.labelKey) }}</component>
              </div>
            </div>
            <button type="button" class="patient-appointment__link" @click="changing = true">{{ t("publicAppointment.changeAnswer") }}</button>
          </section>

          <section v-else-if="appointment.patient_response === 'cannot_attend' && !changing" class="patient-appointment__done" role="status" data-testid="appointment-answer">
            <div class="patient-appointment__thanks patient-appointment__thanks--no">
              <span class="patient-appointment__thanks-badge"><AppIcon name="phone" /></span>
              <h2>{{ t("publicAppointment.cannotTitle") }}</h2>
              <p>{{ t("publicAppointment.cannotBody") }}</p>
            </div>
            <div class="patient-appointment__contact-big">
              <a v-if="appointment.contact_phone" :href="`tel:${telHref(appointment.contact_phone)}`" class="patient-appointment__contact-btn">
                <AppIcon name="phone" /> {{ appointment.contact_phone }}
              </a>
              <a v-if="appointment.contact_email" :href="`mailto:${appointment.contact_email}`" class="patient-appointment__contact-btn patient-appointment__contact-btn--quiet">
                <AppIcon name="mail" /> {{ appointment.contact_email }}
              </a>
            </div>
            <button type="button" class="patient-appointment__link" @click="changing = true">{{ t("publicAppointment.changeAnswer") }}</button>
          </section>

          <section v-else class="patient-appointment__ask">
            <p class="patient-appointment__question">{{ t("publicAppointment.askConfirm") }}</p>
            <div class="patient-appointment__choices">
              <button
                type="button"
                class="patient-appointment__choice patient-appointment__choice--yes"
                :class="{ 'patient-appointment__choice--dim': intent === 'cannot' }"
                data-testid="appointment-confirm"
                :disabled="busy"
                @click="respond('confirmed')"
              >
                <span class="patient-appointment__choice-icon"><AppIcon name="check" /></span>
                {{ t("publicAppointment.yes") }}
              </button>
              <button
                type="button"
                class="patient-appointment__choice patient-appointment__choice--no"
                :class="{ 'patient-appointment__choice--dim': intent === 'confirm' }"
                data-testid="appointment-cannot"
                :disabled="busy"
                @click="respond('cannot_attend')"
              >
                <span class="patient-appointment__choice-icon"><AppIcon name="close" /></span>
                {{ t("publicAppointment.no") }}
              </button>
            </div>
          </section>
        </template>

        <AppInlineAlert v-if="actionError" type="error" :text="t('publicAppointment.error')" class="patient-appointment__alert" />

        <dl class="patient-appointment__details" :class="{ 'patient-appointment__details--cancelled': appointment.status === 'cancelled' }" data-testid="appointment-details">
          <div><dt>{{ t("publicAppointment.date") }}</dt><dd>{{ when.date }}</dd></div>
          <div><dt>{{ t("publicAppointment.time") }}</dt><dd>{{ when.time }}</dd></div>
          <div v-if="appointment.clinic_name"><dt>{{ t("publicAppointment.clinic") }}</dt><dd>{{ appointment.clinic_name }}</dd></div>
          <div v-if="appointment.clinic_address"><dt>{{ t("publicAppointment.address") }}</dt><dd>{{ appointment.clinic_address }}</dd></div>
          <div v-if="appointment.doctor_name"><dt>{{ t("publicAppointment.doctor") }}</dt><dd>{{ appointment.doctor_name }}</dd></div>
        </dl>

        <div v-if="(appointment.contact_phone || appointment.contact_email) && !(open && appointment.patient_response === 'cannot_attend' && !changing)" class="patient-appointment__contact">
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
import { calendarTargets, type CalendarTarget } from "../utils/calendarTargets";

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
  /** CORE-116: the same event as .ics + Google / Outlook links; null once cancelled or over. */
  calendar: { ics: string; google: string; outlook: string } | null;
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

const targets = calendarTargets(typeof navigator === "undefined" ? "" : navigator.userAgent);

function targetAttrs(target: CalendarTarget): Record<string, string> {
  const cal = appointment.value?.calendar;
  if (target.kind === "ics" || !cal) return { type: "button" };
  return { href: target.kind === "google" ? cal.google : cal.outlook, target: "_blank", rel: "noopener noreferrer" };
}

/** The .ics opens in Apple Calendar on iPhone / Mac and in the phone's own calendar app on Android. */
function onTarget(target: CalendarTarget) {
  const ics = appointment.value?.calendar?.ics;
  if (target.kind !== "ics" || !ics) return;
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "cita.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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

.patient-appointment__when {
  margin: 0;
  font-weight: 600;
  text-align: center;
  color: rgb(var(--v-theme-primary));
}

.patient-appointment__details > div {
  grid-template-columns: minmax(72px, 30%) 1fr;
}

.patient-appointment__thanks-badge :deep(svg),
.patient-appointment__choice-icon :deep(svg) {
  width: 1em;
  height: 1em;
}

/* CORE-116: one question, two big coloured answers. */
.patient-appointment__question {
  margin: 4px 0 12px;
  font-size: 1.25rem;
  font-weight: 700;
  text-align: center;
}

.patient-appointment__choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.patient-appointment__choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  padding: 16px 12px;
  border: 2px solid transparent;
  border-radius: 20px;
  font: inherit;
  font-size: 1.0625rem;
  font-weight: 700;
  line-height: 1.25;
  cursor: pointer;
  transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}

.patient-appointment__choice:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.patient-appointment__choice:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}

.patient-appointment__choice:focus-visible {
  outline: 3px solid rgba(var(--v-theme-primary), 0.5);
  outline-offset: 2px;
}

.patient-appointment__choice:disabled {
  opacity: 0.6;
  cursor: progress;
}

.patient-appointment__choice--yes {
  background: rgb(var(--v-theme-success));
  color: #ffffff;
}

.patient-appointment__choice--no {
  background: rgba(var(--v-theme-error), 0.08);
  border-color: rgba(var(--v-theme-error), 0.35);
  color: rgb(var(--v-theme-error));
}

.patient-appointment__choice--dim {
  opacity: 0.75;
}

.patient-appointment__choice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  font-size: 24px;
  background: rgba(255, 255, 255, 0.22);
}

.patient-appointment__choice--no .patient-appointment__choice-icon {
  background: rgba(var(--v-theme-error), 0.12);
}

/* After the answer: steps, a thank-you, then the calendar. */
.patient-appointment__done {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.patient-appointment__steps {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8125rem;
  font-weight: 600;
}

.patient-appointment__step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-appointment__step--done {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.patient-appointment__step--current {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.patient-appointment__step span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: #ffffff;
  font-size: 0.6875rem;
}

.patient-appointment__thanks {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.patient-appointment__thanks h2 {
  margin: 8px 0 0;
  font-size: 1.5rem;
}

.patient-appointment__thanks p {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-appointment__thanks-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  font-size: 36px;
  background: rgb(var(--v-theme-success));
  color: #ffffff;
  box-shadow: 0 0 0 10px rgba(var(--v-theme-success), 0.14);
  animation: patient-appointment-pop 420ms cubic-bezier(0.2, 0.9, 0.3, 1.3) both;
}

.patient-appointment__thanks--no .patient-appointment__thanks-badge {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  box-shadow: none;
}

@keyframes patient-appointment-pop {
  from { transform: scale(0.4); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.patient-appointment__calendar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(var(--v-theme-primary), 0.06);
  animation: patient-appointment-rise 360ms 180ms ease both;
}

@keyframes patient-appointment-rise {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.patient-appointment__calendar-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.patient-appointment__calendar-head h3 {
  margin: 0;
  font-size: 1.0625rem;
}

.patient-appointment__calendar-head p {
  margin: 2px 0 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.patient-appointment__calendar-icon {
  flex: none;
  font-size: 28px;
  color: rgb(var(--v-theme-primary));
}

.patient-appointment__calendar-primary {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 56px;
  padding: 12px 16px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font: inherit;
  font-size: 1.0625rem;
  font-weight: 700;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

.patient-appointment__calendar-primary small {
  font-size: 0.8125rem;
  font-weight: 500;
  opacity: 0.85;
}

.patient-appointment__calendar-others-title {
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  text-align: center;
}

.patient-appointment__calendar-others {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.patient-appointment__calendar-other {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(var(--v-theme-primary), 0.4);
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.patient-appointment__contact-big {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.patient-appointment__contact-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  border-radius: 14px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
  text-decoration: none;
}

.patient-appointment__contact-btn--quiet {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

@media (prefers-reduced-motion: reduce) {
  .patient-appointment__thanks-badge,
  .patient-appointment__calendar {
    animation: none;
  }
  .patient-appointment__choice {
    transition: none;
  }
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
