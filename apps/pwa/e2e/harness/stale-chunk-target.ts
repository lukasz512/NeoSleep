/** Lazy "detail view" for e2e/stale-chunk.spec.ts — the spec swaps its response for HTML. */
import { defineComponent, h } from "vue";

export default defineComponent({ render: () => h("div", { "data-testid": "detail-view" }, "detail") });
