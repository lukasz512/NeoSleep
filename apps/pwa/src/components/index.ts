/**
 * Reusable components. Names are app-neutral for future reuse (client, portal, admin).
 * AppDataTable – list/table views (HCP, HCO, etc.). PageSection – simple page block (card with title/subtitle).
 * AppFilterBar – shared filter UI (menu, badge with active count, clear); use with useFilters composable.
 */

export { default as AppDataTable } from "./AppDataTable.vue";
export type { AppDataTableHeader } from "./AppDataTable.types";
export { default as AppFilterBar } from "./AppFilterBar.vue";
export { default as PageSection } from "./PageSection.vue";
export { default as AppEmptyState } from "./AppEmptyState.vue";
export { default as ItemDetailLayout } from "./ItemDetailLayout.vue";
