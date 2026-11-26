import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import IdentityDetails from "./IdentityDetails.vue";
import { defineComponent, h } from "vue";
import { IDENTITY_DETAILS_WRAP, IdentityDetailsWrapScope } from "./identityDetailsWrap";

// NEO-158: in the record header the identity line wraps between its parts.

const vuetify = () =>
  createVuetify({
    components: vuetifyComponents,
    directives: vuetifyDirectives,
  });
const inHeader = { [IDENTITY_DETAILS_WRAP as symbol]: true };

describe("IdentityDetails", () => {
  it("stays a single run of text outside a record header (list rows)", () => {
    const w = mount(IdentityDetails, {
      props: { details: ["Pulmonologist", "Klinika Testowa"] },
      global: { plugins: [vuetify()] },
    });
    expect(w.find(".identity-details--wrap").exists()).toBe(false);
    expect(w.text()).toMatch(/^Pulmonologist\s*·\s*Klinika Testowa$/);
  });

  it("in a record header, renders one part per value, the separator ending the part before", () => {
    const w = mount(IdentityDetails, {
      props: {
        details: ["Pulmonologist", "Klinika Testowa NEO-51", "Warszawa"],
      },
      global: { plugins: [vuetify()], provide: inHeader },
    });
    const parts = w.findAll(".identity-details__part");
    expect(parts.map((p) => p.text().replace(/\s+/g, " "))).toEqual([
      "Pulmonologist·",
      "Klinika Testowa NEO-51·",
      "Warszawa",
    ]);
    expect(w.text()).toMatch(
      /^Pulmonologist\s*·\s*Klinika Testowa NEO-51\s*·\s*Warszawa$/,
    );
  });

  it("wraps only inside IdentityDetailsWrapScope — not in lists next to it", () => {
    const w = mount(
      defineComponent({
        render: () =>
          h("div", [
            h(IdentityDetailsWrapScope, null, () => h(IdentityDetails, { details: ["A", "B"], class: "in-header" })),
            h(IdentityDetails, { details: ["A", "B"], class: "in-list" }),
          ]),
      }),
      { global: { plugins: [vuetify()] } },
    );
    expect(w.find(".in-header").classes()).toContain("identity-details--wrap");
    expect(w.find(".in-list").classes()).not.toContain("identity-details--wrap");
  });

  it("keeps the +N right after the first value in wrap mode", () => {
    const w = mount(IdentityDetails, {
      props: {
        details: ["Dentist", "Clínica Polanco"],
        more: ["Orthodontist"],
      },
      global: { plugins: [vuetify()], provide: inHeader },
    });
    const first = w.findAll(".identity-details__part")[0]!;
    expect(first.find(".identity-details__more").text()).toBe("+1");
  });
});
