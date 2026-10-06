import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import en from "@i18n/en.json";
import NextVisitTile from "./NextVisitTile.vue";

// Wednesday 2031-03-05, 10:00 at the Mexico City clinic.
const NOW = Date.parse("2031-03-05T16:00:00.000Z");

function mountTile(startAt: string, extra: Record<string, unknown> = {}) {
  setActivePinia(createPinia());
  return mount(NextVisitTile, {
    props: { label: "Next appointment", startAt, timeZone: "America/Mexico_City", title: "Appointment with Dra. Ruiz", canReschedule: true, canComplete: true, now: NOW, ...extra },
    global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } }), createVuetify({ components: vuetifyComponents })] },
  });
}
const keyLine = (w: ReturnType<typeof mountTile>) => w.find(".next-visit__key").text();

describe("NextVisitTile (CORE-162)", () => {
  it("the leaf shows month and day in the clinic's zone", () => {
    // 03:00Z on the 7th is still the 6th in Mexico City.
    const w = mountTile("2031-03-07T03:00:00.000Z");
    expect(w.find(".next-visit__month").text()).toBe("MAR");
    expect(w.find(".next-visit__day").text()).toBe("6");
  });

  it("says today / tomorrow / in N days within the week", () => {
    expect(keyLine(mountTile("2031-03-05T22:00:00.000Z"))).toBe("Next appointment · today");
    expect(keyLine(mountTile("2031-03-06T22:00:00.000Z"))).toBe("Next appointment · tomorrow");
    expect(keyLine(mountTile("2031-03-08T22:00:00.000Z"))).toBe("Next appointment · in 3 days");
  });

  it("beyond a week only the label: the leaf says enough", () => {
    expect(keyLine(mountTile("2031-03-20T22:00:00.000Z"))).toBe("Next appointment");
  });

  it("the leaf opens the visit; the buttons act on their own", async () => {
    const w = mountTile("2031-03-06T22:00:00.000Z");
    await w.find('[data-testid="next-visit-open"]').trigger("click");
    await w.find('[data-testid="next-visit-reschedule"]').trigger("click");
    await w.find('[data-testid="next-visit-complete"]').trigger("click");
    expect(Object.keys(w.emitted())).toEqual(expect.arrayContaining(["open", "reschedule", "complete"]));
    expect(w.emitted("open")).toHaveLength(1);
  });

  it("no action strip when neither action is allowed", () => {
    const w = mountTile("2031-03-06T22:00:00.000Z", { canReschedule: false, canComplete: false });
    expect(w.find(".next-visit__actions").exists()).toBe(false);
  });
});
