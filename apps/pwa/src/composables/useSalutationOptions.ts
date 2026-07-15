import { computed } from "vue";
import { useI18n } from "vue-i18n";

// Shared honorific list for the person title/prefix field (HCP and patient forms).
// The underlying `identities.title` DB column is free text, so this feeds a
// combobox (pick from list or type a custom value), not a strict select.
export function useSalutationOptions() {
  const { t } = useI18n();

  const salutationItems = computed(() => [
    t("app.common.salutation.mr"),
    t("app.common.salutation.mrs"),
    t("app.common.salutation.ms"),
    t("app.common.salutation.miss"),
    t("app.common.salutation.dr"),
    t("app.common.salutation.dra"),
  ]);

  return { salutationItems };
}
