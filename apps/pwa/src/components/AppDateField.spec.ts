import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";
import AppDateField from "./AppDateField.vue";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

function mountField(props: Record<string, unknown> = {}, locale = "pl") {
  const i18n = createI18n({ legacy: false, locale, messages: { en, pl, mx } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(AppDateField, {
    props: { label: "Data urodzenia", ...props },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return wrapper;
}

const dateInput = (w: VueWrapper) => w.find('[data-testid="date-field-date"] input');
const timeInput = (w: VueWrapper) => w.find('[data-testid="date-field-time"] input');
const lastEmit = (w: VueWrapper) => (w.emitted("update:modelValue") ?? []).at(-1)?.[0];

async function typeAndLeave(w: VueWrapper, input: ReturnType<typeof dateInput>, text: string) {
  await input.trigger("focus");
  await input.setValue(text);
  await input.trigger("blur");
  await flushPromises();
}

describe("AppDateField — date (NEO-132)", () => {
  it("formats typed digits in the app's language and emits ISO", async () => {
    const w = mountField();
    await typeAndLeave(w, dateInput(w), "10101990");
    expect((dateInput(w).element as HTMLInputElement).value).toBe("10.10.1990");
    expect(lastEmit(w)).toBe("1990-10-10");
  });

  it("drops a 5th year digit — 10/10/19900 can't be entered", async () => {
    const w = mountField({}, "mx");
    await typeAndLeave(w, dateInput(w), "10/10/19900");
    expect((dateInput(w).element as HTMLInputElement).value).toBe("10/10/1990");
    expect(lastEmit(w)).toBe("1990-10-10");
  });

  it("31 February → says how many days the month has, and emits nothing", async () => {
    const w = mountField();
    await typeAndLeave(w, dateInput(w), "31022026");
    expect(w.text()).toContain("Luty 2026 ma 28 dni");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("half-typed text: no error while typing, an error once the field is left", async () => {
    const w = mountField();
    const input = dateInput(w);
    await input.trigger("focus");
    await input.setValue("1010");
    await flushPromises();
    expect(w.text()).not.toContain("Wpisz pełną datę");
    await input.trigger("blur");
    await flushPromises();
    expect(w.text()).toContain("Wpisz pełną datę (DD.MM.YYYY)");
  });

  it("max 'today' refuses a future date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 27, 12));
    const w = mountField({ max: "today" });
    await typeAndLeave(w, dateInput(w), "28092026");
    expect(w.text()).toContain("Data nie może być w przyszłości");
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("shows a stored value and re-emits null when it is cleared", async () => {
    const w = mountField({ modelValue: "1985-03-07" });
    expect((dateInput(w).element as HTMLInputElement).value).toBe("07.03.1985");
    await typeAndLeave(w, dateInput(w), "");
    expect(lastEmit(w)).toBeNull();
  });

  it("the caller's rules see the ISO value, not the typed text", async () => {
    const seen: unknown[] = [];
    const w = mountField({ rules: [(v: unknown) => (seen.push(v), true)] });
    await typeAndLeave(w, dateInput(w), "01021990");
    expect(seen).toContain("1990-02-01");
    expect(seen).not.toContain("01.02.1990");
  });
});

describe("AppDateField — date + time side by side (T2)", () => {
  it("emits YYYY-MM-DDTHH:mm only once both halves are valid", async () => {
    const w = mountField({ mode: "datetime" }, "mx");
    await typeAndLeave(w, dateInput(w), "02102031");
    expect(w.emitted("update:modelValue")).toBeUndefined();
    await typeAndLeave(w, timeInput(w), "0930");
    expect((timeInput(w).element as HTMLInputElement).value).toBe("09:30");
    expect(lastEmit(w)).toBe("2031-10-02T09:30");
  });

  it("splits a stored value into its date and time halves", () => {
    const w = mountField({ mode: "datetime", modelValue: "2031-10-02T16:45" }, "en");
    expect((dateInput(w).element as HTMLInputElement).value).toBe("10/02/2031");
    expect((timeInput(w).element as HTMLInputElement).value).toBe("16:45");
  });

  it("25:00 is refused", async () => {
    const w = mountField({ mode: "datetime" }, "mx");
    await typeAndLeave(w, timeInput(w), "2500");
    expect(w.text()).toContain("Escribe una hora entre 00:00 y 23:59");
  });

  it("the slot list strikes through times that would overlap a taken booking", async () => {
    const w = mountField({ mode: "datetime", busy: [{ start: "10:00", end: "11:00" }], busyDuration: 60 }, "mx");
    await w.find('[data-testid="date-field-open-times"]').trigger("click");
    await flushPromises();
    const slot = (t: string) => document.body.querySelector<HTMLButtonElement>(`[data-testid="date-field-times"] [data-time="${t}"]`);
    expect(slot("09:00")?.disabled).toBe(false);
    expect(slot("09:30")?.disabled).toBe(true);
    expect(slot("09:30")?.textContent).toContain("ocupado");
    expect(slot("11:00")?.disabled).toBe(false);
    slot("11:00")!.click();
    await flushPromises();
    expect((timeInput(w).element as HTMLInputElement).value).toBe("11:00");
  });
});
