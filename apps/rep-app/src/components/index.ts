/**
 * Reusable components. Names are app-neutral for future reuse (client, portal, admin).
 * RepDataTable – list/table views (HCP, HCO, etc.). PageSection – simple page block (card with title/subtitle).
 * RepFilterBar – shared filter UI (menu, badge with active count, clear); use with useRepFilters composable.
 */

export { default as RepDataTable } from "./RepDataTable.vue";
export type { RepDataTableHeader } from "./RepDataTable.vue";
export { default as RepFilterBar } from "./RepFilterBar.vue";
export { default as PageSection } from "./PageSection.vue";
export { default as AppEmptyState } from "./AppEmptyState.vue";
export { default as ItemDetailLayout } from "./ItemDetailLayout.vue";
