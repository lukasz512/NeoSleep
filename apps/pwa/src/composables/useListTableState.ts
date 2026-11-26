/**
 * A list table's sort + rows per page, remembered per user on this device (CORE-45).
 * The page number is never remembered — a list always opens on page 1, like Gmail or Linear.
 * Returns the object bound to VDataTableServer's v-model:options, which replaces it wholesale
 * (with extra keys such as groupBy); only itemsPerPage and sortBy are saved.
 */
import { ref, watch } from "vue";
import { usePersistedState } from "@prefs";

export interface SortItem {
  key: string;
  order: "asc" | "desc";
}

export interface TableState {
  itemsPerPage: number;
  sortBy: SortItem[];
}

export const DEFAULT_TABLE_STATE: TableState = {
  itemsPerPage: 10,
  sortBy: [{ key: "created_at", order: "desc" }],
};

/** Page sizes the table offers; "All" (-1) is left out on purpose — never restore an unbounded list. */
const PAGE_SIZES = new Set([5, 10, 25, 50, 100]);

export function useListTableState(viewId: string) {
  const saved = usePersistedState<TableState>(`view:${viewId}:table`, DEFAULT_TABLE_STATE, {
    validate: (s) => {
      const sortBy = s.sortBy.filter((x) => x.order === "asc" || x.order === "desc");
      return {
        itemsPerPage: PAGE_SIZES.has(s.itemsPerPage) ? s.itemsPerPage : DEFAULT_TABLE_STATE.itemsPerPage,
        sortBy: sortBy.length || !s.sortBy.length ? sortBy : structuredClone(DEFAULT_TABLE_STATE.sortBy),
      };
    },
  });

  const tableOptions = ref({ page: 1, itemsPerPage: saved.value.itemsPerPage, sortBy: [...saved.value.sortBy] });

  watch(
    () => [tableOptions.value.itemsPerPage, tableOptions.value.sortBy] as const,
    ([itemsPerPage, sortBy]) => {
      if (itemsPerPage === saved.value.itemsPerPage && JSON.stringify(sortBy) === JSON.stringify(saved.value.sortBy)) return;
      saved.value = { itemsPerPage, sortBy: sortBy.map((s) => ({ key: s.key, order: s.order })) };
    },
    { deep: true },
  );

  // Another account signed in (or another tab changed it): show their settings from page 1.
  watch(saved, (s) => {
    if (s.itemsPerPage === tableOptions.value.itemsPerPage && JSON.stringify(s.sortBy) === JSON.stringify(tableOptions.value.sortBy)) return;
    tableOptions.value = { ...tableOptions.value, page: 1, itemsPerPage: s.itemsPerPage, sortBy: [...s.sortBy] };
  });

  return tableOptions;
}
