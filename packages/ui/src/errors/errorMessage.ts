/**
 * Vue bindings for the class-based error text (NEO-81). The key selection
 * itself is framework-free and lives in @neo/api-client (errorMessage.ts), so
 * .vue components here and plain .ts code in the apps pick identical wording.
 */
import { computed, type ComputedRef, type Ref } from "vue";
import { useI18n } from "vue-i18n";
import { describeError, type ErrorText } from "@api";

/** Translates an error into title/body/reference with the active locale. */
export function useErrorText(): (err: unknown) => ErrorText {
  const { t } = useI18n();
  return (err: unknown) => describeError(err, (key, params) => (params ? t(key, params) : t(key)));
}

/** Reactive variant for a component holding the last error in a ref (null = no error). */
export function useErrorTextFor(error: Ref<unknown>): ComputedRef<ErrorText | null> {
  const describe = useErrorText();
  return computed(() => (error.value == null || error.value === false ? null : describe(error.value)));
}
