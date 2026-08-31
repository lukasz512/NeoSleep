<template>
  <Transition name="bm-fade">
    <div v-show="modelValue" class="booking-modal__overlay" aria-hidden="true" @click="close" />
  </Transition>

  <OriginDialogTransition>
    <div
      v-show="modelValue"
      class="booking-modal__panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('website.professionalsPage.booking.modalTitle')"
    >
      <button type="button" class="booking-modal__close" :aria-label="t('website.professionalsPage.booking.modalClose')" @click="close">
        <span aria-hidden="true">&times;</span>
      </button>

      <div class="booking-modal__body">

        <button
          v-if="step === 'details' && selectedSlot"
          type="button"
          class="booking-modal__back"
          @click="step = 'calendar'"
        >
          ← {{ t("website.professionalsPage.booking.back") }}
        </button>

        <h2 v-if="step === 'calendar'" class="booking-modal__heading booking-modal__heading--top">
          {{ t("website.professionalsPage.booking.heading") }}
        </h2>

        <div class="booking-modal__info-panel">
          <p class="booking-modal__info-title">{{ t("website.professionalsPage.booking.infoPanelTitle") }}</p>
          <p class="booking-modal__info-sub">{{ t("website.professionalsPage.booking.infoPanelSub") }}</p>
        </div>

        <!-- ── Step 1: calendar ────────────────────────────────────────── -->
        <template v-if="step === 'calendar'">
          <p class="booking-modal__sub">{{ t("website.professionalsPage.booking.sub") }}</p>

          <div v-if="slotsLoading" class="booking-modal__skeleton" aria-hidden="true">
            <div class="bm-skel bm-skel--tabs" />
            <div class="bm-skel-strip">
              <div v-for="n in 7" :key="n" class="bm-skel bm-skel--day" />
            </div>
            <div class="bm-skel-slots">
              <div v-for="n in 8" :key="n" class="bm-skel bm-skel--slot" />
            </div>
            <div class="bm-skel bm-skel--submit" />
          </div>
          <div v-else-if="slotsError" class="booking-modal__status booking-modal__status--error">
            <span>{{ t("website.professionalsPage.booking.loadError") }}</span>
            <button type="button" class="booking-modal__retry" @click="loadSlots">{{ t("website.professionalsPage.booking.retry") }}</button>
          </div>
          <p v-else-if="allDays.length === 0" class="booking-modal__status">{{ t("website.professionalsPage.booking.empty") }}</p>

          <template v-else>
            <div class="booking-modal__date-strip">
              <button
                type="button"
                class="booking-modal__strip-arrow"
                :disabled="stripPage === 0"
                aria-label="Previous"
                @click="stripPage--"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>

              <div class="booking-modal__days">
                <button
                  v-for="(day, idx) in visibleDays"
                  :key="day.key"
                  type="button"
                  class="booking-modal__day"
                  :class="{
                    'booking-modal__day--selected': absoluteIndex(idx) === selectedDayIndex,
                    'booking-modal__day--empty': day.slots.length === 0,
                  }"
                  :disabled="day.slots.length === 0"
                  @click="selectDay(absoluteIndex(idx))"
                >
                  <span class="booking-modal__day-weekday">{{ formatWeekday(day.date) }}</span>
                  <span class="booking-modal__day-num">{{ day.date.getDate() }}</span>
                  <span v-if="day.slots.some((s) => s.available)" class="booking-modal__day-dot" aria-hidden="true" />
                </button>
              </div>

              <button
                type="button"
                class="booking-modal__strip-arrow"
                :disabled="!hasNextPage"
                aria-label="Next"
                @click="stripPage++"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>

            <div class="booking-modal__dayparts">
              <div
                class="booking-modal__dayparts-thumb"
                aria-hidden="true"
                :style="{ transform: `translateX(${activeDayPartIndex * 100}%)` }"
              />
              <button
                v-for="part in DAY_PARTS"
                :key="part"
                type="button"
                class="booking-modal__daypart"
                :class="{ 'booking-modal__daypart--active': activeDayPart === part }"
                @click="activeDayPart = part"
              >
                {{ t(`website.professionalsPage.booking.${part}`) }}
              </button>
            </div>

            <div class="booking-modal__slots">
              <p v-if="dayPartSlots.length === 0" class="booking-modal__status">{{ t("website.professionalsPage.booking.noSlotsForDay") }}</p>
              <button
                v-for="slot in dayPartSlots"
                :key="slot.start"
                type="button"
                class="booking-modal__slot"
                :class="{
                  'booking-modal__slot--selected': selectedSlot?.start === slot.start,
                  'booking-modal__slot--unavailable': !slot.available,
                }"
                :disabled="!slot.available"
                @click="selectedSlot = slot"
              >
                {{ formatTime(slot.start) }}
              </button>
            </div>

            <button type="button" class="booking-modal__submit" :disabled="!selectedSlot" @click="step = 'details'">
              {{ t("website.professionalsPage.booking.continue") }}
            </button>
          </template>
        </template>

        <!-- ── Step 2: details ─────────────────────────────────────────── -->
        <template v-else-if="step === 'details' && selectedSlot">
          <h2 class="booking-modal__heading">{{ t("website.professionalsPage.booking.detailsHeading") }}</h2>
          <p class="booking-modal__selected-slot">{{ t("website.professionalsPage.booking.selectedSlotLabel", { time: formatSlotLabel(selectedSlot) }) }}</p>

          <form class="booking-modal__form" @submit.prevent="onSubmit">
            <ProfessionalContactFields v-model="form" id-prefix="booking-modal" />

            <button type="submit" class="booking-modal__submit" :disabled="submitting">
              {{ submitting ? t("website.professionalsPage.booking.booking") : t("website.professionalsPage.booking.confirm") }}
            </button>
            <p v-if="submitError" class="booking-modal__status booking-modal__status--error">{{ submitError }}</p>
          </form>
        </template>

        <!-- ── Step 3: done ────────────────────────────────────────────── -->
        <template v-else-if="step === 'done'">
          <p class="booking-modal__status booking-modal__status--success">{{ t("website.professionalsPage.booking.success") }}</p>
        </template>

      </div>
    </div>
  </OriginDialogTransition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { OriginDialogTransition } from "@ui";
import { apiFetch } from "../utils/api";
import ProfessionalContactFields, { emptyProfessionalContactData, type ProfessionalContactData } from "./ProfessionalContactFields.vue";

interface Slot {
  start: string;
  end: string;
  available: boolean;
}

interface DayBucket {
  key: string;
  date: Date;
  slots: Slot[];
}

export interface BookingPrefill {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  institution?: string;
  city?: string;
  countryCode?: string;
}

const props = defineProps<{
  modelValue: boolean;
  prefill?: BookingPrefill | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { t, locale } = useI18n();

function close() {
  emit("update:modelValue", false);
}

const WINDOW_DAYS = 7;
const DAY_PARTS = ["morning", "afternoon", "evening"] as const;
type DayPart = (typeof DAY_PARTS)[number];

const step = ref<"calendar" | "details" | "done">("calendar");
const slots = ref<Slot[]>([]);
const slotsLoading = ref(true);
const slotsError = ref(false);
const stripPage = ref(0);
const selectedDayIndex = ref(0);
const activeDayPart = ref<DayPart>("morning");
const activeDayPartIndex = computed(() => DAY_PARTS.indexOf(activeDayPart.value));
const selectedSlot = ref<Slot | null>(null);
const submitting = ref(false);
const submitError = ref("");
let leadId: string | undefined;

// A ref, not reactive() — v-model on ProfessionalContactFields needs to
// reassign this binding wholesale on every update:modelValue, which only
// works when the script-setup binding is a ref (reactive() has no .value
// to reassign, so `v-model="form"` would throw on the first field edit).
const form = ref<ProfessionalContactData>(emptyProfessionalContactData());

watch(
  () => props.prefill,
  (p) => {
    if (!p) return;
    leadId = p.id;
    form.value = {
      firstName: p.firstName || form.value.firstName,
      lastName: p.lastName || form.value.lastName,
      institution: p.institution || form.value.institution,
      phone: p.phone || form.value.phone,
      email: p.email || form.value.email,
      city: p.city || form.value.city,
      countryCode: p.countryCode || form.value.countryCode,
    };
  },
  { immediate: true }
);

// Reset to a fresh calendar step and reload slots every time the modal opens
// — a stale slot list from a previous open could show something already booked.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    step.value = "calendar";
    selectedSlot.value = null;
    submitError.value = "";
    void loadSlots();
  },
  { immediate: true }
);

async function loadSlots() {
  slotsLoading.value = true;
  slotsError.value = false;
  try {
    const res = await apiFetch("/api/v1/booking/slots");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { slots: Slot[] };
    slots.value = data.slots;
    selectFirstAvailableDay();
  } catch {
    slotsError.value = true;
  } finally {
    slotsLoading.value = false;
  }
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Every calendar day (including weekends/out-of-window days, shown dimmed) between the first and last returned slot — Booksy-style continuous strip. */
const allDays = computed<DayBucket[]>(() => {
  if (slots.value.length === 0) return [];

  const byDay = new Map<string, Slot[]>();
  for (const slot of slots.value) {
    const key = dateKey(new Date(slot.start));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(slot);
  }

  const dayStarts = slots.value.map((s) => startOfDay(new Date(s.start)).getTime());
  const minDay = new Date(Math.min(...dayStarts));
  const maxDay = new Date(Math.max(...dayStarts));

  const days: DayBucket[] = [];
  for (const cursor = new Date(minDay); cursor <= maxDay; cursor.setDate(cursor.getDate() + 1)) {
    const key = dateKey(cursor);
    days.push({ key, date: new Date(cursor), slots: byDay.get(key) ?? [] });
  }
  return days;
});

function selectFirstAvailableDay() {
  let idx = allDays.value.findIndex((d) => d.slots.some((s) => s.available));
  if (idx < 0) idx = allDays.value.findIndex((d) => d.slots.length > 0);
  selectedDayIndex.value = idx >= 0 ? idx : 0;
  stripPage.value = Math.floor(selectedDayIndex.value / WINDOW_DAYS);
  activeDayPart.value = "morning";
}

const visibleDays = computed(() => allDays.value.slice(stripPage.value * WINDOW_DAYS, stripPage.value * WINDOW_DAYS + WINDOW_DAYS));
const hasNextPage = computed(() => (stripPage.value + 1) * WINDOW_DAYS < allDays.value.length);

function absoluteIndex(visibleIdx: number): number {
  return stripPage.value * WINDOW_DAYS + visibleIdx;
}

function selectDay(idx: number) {
  selectedDayIndex.value = idx;
  selectedSlot.value = null;
  activeDayPart.value = "morning";
}

const selectedDaySlots = computed(() => allDays.value[selectedDayIndex.value]?.slots ?? []);

function dayPartOf(hour: number): DayPart {
  if (hour < 13) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

const dayPartSlots = computed(() => selectedDaySlots.value.filter((s) => dayPartOf(new Date(s.start).getHours()) === activeDayPart.value));

const INTL_LOCALE: Record<string, string> = { pl: "pl-PL", mx: "es-MX", en: "en-US" };
function intlLocale(): string {
  return INTL_LOCALE[locale.value] ?? INTL_LOCALE.en;
}

function formatWeekday(d: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), { weekday: "short" }).format(d);
}

function formatTime(iso: string): string {
  // es-MX renders the am/pm marker as "a.m." / "p.m." — strip the periods so
  // it reads "am"/"pm", matching the other locales' unpunctuated markers.
  return new Date(iso).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" }).replace(/\./g, "");
}

function formatSlotLabel(slot: Slot): string {
  return `${new Date(slot.start).toLocaleDateString(intlLocale(), { weekday: "short", month: "short", day: "numeric" })}, ${formatTime(slot.start)}`;
}

async function onSubmit() {
  const slot = selectedSlot.value;
  if (!slot) return;

  submitting.value = true;
  submitError.value = "";
  try {
    const res = await apiFetch("/api/v1/booking/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: slot.start,
        end: slot.end,
        leadId,
        firstName: form.value.firstName,
        lastName: form.value.lastName,
        email: form.value.email,
        phone: form.value.phone,
        institution: form.value.institution,
        city: form.value.city,
        countryCode: form.value.countryCode,
      }),
    });
    if (res.status === 409) {
      submitError.value = t("website.professionalsPage.booking.conflictError");
      step.value = "calendar";
      selectedSlot.value = null;
      await loadSlots();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    step.value = "done";
  } catch {
    submitError.value = t("website.professionalsPage.booking.submitError");
  } finally {
    submitting.value = false;
  }
}
</script>

<style lang="scss">
@layer components {
  .booking-modal__overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
  }

  .booking-modal__panel {
    position: fixed;
    inset: 0;
    z-index: 10001;
    margin: auto;
    width: min(560px, calc(100vw - 2rem));
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    background: var(--website-bg);
    border-radius: calc(var(--website-radius) * 2);
    box-shadow: var(--website-shadow-md, 0 20px 60px rgba(0, 0, 0, 0.25));
    height: fit-content;
  }

  .booking-modal__close {
    position: sticky;
    top: 0;
    float: right;
    margin: 0.75rem 0.75rem 0 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.06);
    color: var(--website-text);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    z-index: 1;

    @media (hover: hover) {
      &:hover { background: rgba(0, 0, 0, 0.12); }
    }
  }

  .booking-modal__body {
    padding: 1rem 2rem 2rem;
    clear: both;
  }

  .booking-modal__heading {
    margin: 0 0 0.5rem;
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--website-text);

    &--top { margin-bottom: 1rem; }
  }

  .booking-modal__sub {
    margin: 0 0 1.5rem;
    font-size: 0.9375rem;
    color: var(--website-text-secondary);
  }

  .booking-modal__status {
    margin: 0;
    text-align: center;
    color: var(--website-text-secondary);
    padding: 1rem 0;

    &--error { color: #c53030; }
    &--success { color: var(--website-primary); font-weight: 600; font-size: 1.0625rem; padding: 2rem 0; }
  }

  .booking-modal__retry {
    display: block;
    margin: 0.5rem auto 0;
    color: var(--website-primary);
    background: none;
    border: none;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  /* ── Info panel (top of modal, all steps) ───────────────────────────── */
  .booking-modal__info-panel {
    padding: 1rem 1.25rem;
    background: color-mix(in srgb, var(--website-primary) 6%, transparent);
    border-radius: var(--website-radius);
    margin-bottom: 1.5rem;
  }

  .booking-modal__info-title {
    margin: 0 0 0.25rem;
    font-weight: 700;
    color: var(--website-text);
  }

  .booking-modal__info-sub {
    margin: 0;
    font-size: 0.875rem;
    color: var(--website-text-secondary);
  }

  /* ── Skeleton loader ─────────────────────────────────────────────────── */
  .bm-skel {
    border-radius: var(--website-radius);
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.06) 25%, rgba(0, 0, 0, 0.11) 37%, rgba(0, 0, 0, 0.06) 63%);
    background-size: 400% 100%;
    animation: bm-shimmer 1.4s ease infinite;

    [data-theme="dark"] & {
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 25%, rgba(255, 255, 255, 0.12) 37%, rgba(255, 255, 255, 0.06) 63%);
      background-size: 400% 100%;
    }
  }

  .bm-skel--tabs {
    width: 100%;
    height: 40px;
    margin-bottom: 1rem;
  }

  .bm-skel-strip {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.375rem;
    margin-bottom: 1rem;
  }

  .bm-skel--day {
    height: 58px;
  }

  .bm-skel-slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    grid-auto-rows: 2.75rem;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .bm-skel--submit {
    width: 100%;
    height: 44px;
    border-radius: 9999px;
  }

  @keyframes bm-shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }

  /* ── Date strip ──────────────────────────────────────────────────────── */
  .booking-modal__date-strip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .booking-modal__strip-arrow {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--website-border);
    background: var(--website-bg);
    color: var(--website-text);
    cursor: pointer;

    svg { width: 16px; height: 16px; }

    &:disabled { opacity: 0.35; cursor: not-allowed; }
    @media (hover: hover) {
      &:not(:disabled):hover { border-color: var(--website-primary); color: var(--website-primary); }
    }
  }

  .booking-modal__days {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0.375rem;
  }

  .booking-modal__day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 0.25rem;
    border-radius: var(--website-radius);
    border: 1px solid var(--website-border);
    background: var(--website-bg);
    color: var(--website-text);
    cursor: pointer;
    font: inherit;

    @media (hover: hover) {
      &:not(:disabled):hover { border-color: var(--website-primary); }
    }

    &--selected {
      background: var(--website-primary);
      border-color: var(--website-primary);
      color: #fff;

      .booking-modal__day-dot { background: #fff; }
    }

    &--empty,
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .booking-modal__day-weekday {
    font-size: 0.6875rem;
    text-transform: capitalize;
    opacity: 0.85;
  }

  .booking-modal__day-num {
    font-size: 1rem;
    font-weight: 700;
  }

  .booking-modal__day-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--website-primary);
    margin-top: 2px;
  }

  /* ── Day-part tabs ───────────────────────────────────────────────────── */
  .booking-modal__dayparts {
    position: relative;
    display: flex;
    background: color-mix(in srgb, var(--website-text) 6%, transparent);
    border-radius: 9999px;
    padding: 0.25rem;
    margin-bottom: 1rem;
  }

  // Single sliding indicator (not a per-button background swap) — same
  // technique as packages/ui's AppSegmentedTabs used in apps/pwa, reimplemented
  // against --website-* tokens since apps/web doesn't run Vuetify.
  .booking-modal__dayparts-thumb {
    position: absolute;
    top: 0.25rem;
    bottom: 0.25rem;
    left: 0.25rem;
    width: calc((100% - 0.5rem) / 3);
    background: var(--website-bg);
    border-radius: 9999px;
    box-shadow: var(--website-shadow-sm);
    transition: transform 380ms cubic-bezier(0.34, 1.2, 0.64, 1);
    will-change: transform;
    pointer-events: none;
  }

  .booking-modal__daypart {
    position: relative;
    z-index: 1;
    flex: 1;
    padding: 0.5rem;
    border: none;
    border-radius: 9999px;
    background: transparent;
    color: var(--website-text-secondary);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 200ms ease;

    &--active {
      color: var(--website-text);
    }
  }

  /* ── Time slots ──────────────────────────────────────────────────────── */
  .booking-modal__slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
    grid-auto-rows: 2.75rem;
    gap: 0.5rem;
    // Reserves two full rows even for a single-line "no slots" message, so
    // that message doesn't collapse to 1 row while a populated day shows 2.
    min-height: calc(2.75rem * 2 + 0.5rem);
    margin-bottom: 1.25rem;

    .booking-modal__status {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
  }

  .booking-modal__slot {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--website-bg);
    border: 1px solid var(--website-border);
    border-radius: var(--website-radius);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-text);
    cursor: pointer;

    // Scoped to real hover devices — on touch, `:hover` sticks after tap
    // until the next tap elsewhere, which read as the slot turning green
    // and staying that way after selection.
    @media (hover: hover) {
      &:not(:disabled):hover { border-color: var(--website-primary); color: var(--website-primary); }
    }

    &--selected {
      background: var(--website-primary);
      border-color: var(--website-primary);
      color: #fff;

      // Without this, the generic hover rule above wins on specificity and
      // repaints the selected slot's text the same teal as its own
      // background — hovering a selected slot made its time unreadable.
      @media (hover: hover) {
        &:not(:disabled):hover { color: #fff; }
      }
    }

    &--unavailable,
    &:disabled {
      opacity: 0.35;
      text-decoration: line-through;
      cursor: not-allowed;
      background: color-mix(in srgb, var(--website-text) 4%, transparent);
    }
  }

  /* ── Details form ────────────────────────────────────────────────────── */
  .booking-modal__back {
    display: block;
    margin-bottom: 1rem;
    color: var(--website-primary);
    background: none;
    border: none;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
  }

  .booking-modal__selected-slot {
    margin: 0 0 1.25rem;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, var(--website-primary) 8%, transparent);
    border-radius: var(--website-radius);
    color: var(--website-text);
    font-weight: 600;
  }

  .booking-modal__form {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ── Submit ──────────────────────────────────────────────────────────── */
  .booking-modal__submit {
    min-height: var(--website-btn-min-height);
    min-width: var(--website-btn-min-width);
    padding: 0 1.75rem;
    background: var(--website-primary);
    color: #fff;
    font-weight: 600;
    font-size: 1rem;
    border: none;
    border-radius: 9999px;
    cursor: pointer;
    width: 100%;

    &:hover:not(:disabled) { background: var(--website-primary-hover); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  /* ── Overlay transition (the panel itself uses OriginDialogTransition, the house style shared with apps/pwa) ── */
  .bm-fade-enter-active,
  .bm-fade-leave-active {
    transition: opacity 0.2s ease;
  }
  .bm-fade-enter-from,
  .bm-fade-leave-to {
    opacity: 0;
  }
}
</style>
