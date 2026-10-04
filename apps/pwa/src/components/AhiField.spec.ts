import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import AhiField from "./AhiField.vue";

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountField(modelValue: unknown) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(AhiField, {
    props: { modelValue, label: "AHI baseline" },
    global: { plugins: [vuetify, i18n] },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

const activeBand = (w: VueWrapper) => w.find(".ahi-scale__labels .is-active").text();

describe("AhiField (NEO-228)", () => {
  it("no number yet → no scale", () => {
    expect(mountField(null).find(".ahi-scale").exists()).toBe(false);
    expect(mountField("").find(".ahi-scale").exists()).toBe(false);
  });

  it("highlights the AASM band the AHI falls in, typed value or stored number", () => {
    expect(activeBand(mountField("3"))).toBe("<5");
    expect(activeBand(mountField(5))).toBe(en["app.clinical.result.scale.mild"]);
    expect(activeBand(mountField("22"))).toBe(en["app.clinical.result.scale.moderate"]);
    expect(activeBand(mountField(30))).toBe(en["app.clinical.result.scale.severe"]);
  });

  it("shows the events/h unit and passes the label through", () => {
    const w = mountField(10);
    expect(w.text()).toContain(en["app.patients.form.ahiUnit"]);
    expect(w.find("label").text()).toBe("AHI baseline");
  });

  it("emits what is typed", async () => {
    const w = mountField(null);
    await w.find("input").setValue("17");
    expect(w.emitted("update:modelValue")?.at(-1)).toEqual(["17"]);
  });
});
