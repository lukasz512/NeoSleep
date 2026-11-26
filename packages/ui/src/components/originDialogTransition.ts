import OriginDialogTransition from "./OriginDialogTransition.vue";
import SheetDialogTransition from "./SheetDialogTransition.vue";

/** Pass as `:transition="originDialogTransition"` on a VDialog. */
export const originDialogTransition = { component: OriginDialogTransition };

/** Bottom-sheet slide for phone-width dialogs: `:transition="sheetDialogTransition"`. */
export const sheetDialogTransition = { component: SheetDialogTransition };
