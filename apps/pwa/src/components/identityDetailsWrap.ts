import { defineComponent, provide, type InjectionKey } from "vue";

/**
 * NEO-158: set only around the record header's identity line (ItemDetailLayout
 * wraps its #record-details slot in IdentityDetailsWrapScope). There it may
 * take several lines on a phone, so it wraps between its parts —
 * "Pulmonologist ·" / "Klinika Testowa" — instead of in the middle of one.
 * Everywhere else (list rows, cards, the record's own tabs) it stays one
 * line, as before.
 */
export const IDENTITY_DETAILS_WRAP: InjectionKey<boolean> = Symbol("identity-details-wrap");

/** Renders its slot with IdentityDetails in wrap mode — nothing else. */
export const IdentityDetailsWrapScope = defineComponent({
  name: "IdentityDetailsWrapScope",
  setup(_, { slots }) {
    provide(IDENTITY_DETAILS_WRAP, true);
    return () => slots.default?.();
  },
});
