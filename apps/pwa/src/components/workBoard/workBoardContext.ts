import { inject, ref, type InjectionKey, type Ref } from "vue";
import type { WorkLabelColor } from "../../types/workBoard";

/**
 * What the board shares with every card and chip below it (CORE-219), so the catalog's colours,
 * the card density and one clock don't travel through each component's props.
 */
export interface WorkBoardContext {
  /** Catalog colour by lower-cased label name. */
  colors: Readonly<Ref<Record<string, WorkLabelColor>>>;
  /** Compact cards: no label row, no footer. */
  dense: Readonly<Ref<boolean>>;
  /** The clock behind "live" and "days in column"; the board moves it every minute. */
  now: Readonly<Ref<number>>;
}

export const WORK_BOARD_CONTEXT: InjectionKey<WorkBoardContext> = Symbol("workBoard");

/** The board's context; outside a board (a card on its own) a neutral one. */
export function useWorkBoardContext(): WorkBoardContext {
  return inject(WORK_BOARD_CONTEXT, () => ({ colors: ref({}), dense: ref(false), now: ref(Date.now()) }), true);
}
