import { ref, computed } from "vue";
import { onClickOutside } from "@vueuse/core";
import { useWebsiteLocale } from "./useWebsiteLocale";
import { LANGUAGE_OPTIONS } from "@i18n/language-options";
import type { WebsiteLocale } from "./useWebsiteLocale";

export function useLanguageSelect() {
  const { locale, supported, setLocale } = useWebsiteLocale();
  const wrapRef = ref<HTMLElement | null>(null);
  const open = ref(false);

  const options = computed(() =>
    LANGUAGE_OPTIONS.filter((o) => supported.includes(o.id as WebsiteLocale))
  );
  const currentOption = computed(() => options.value.find((o) => o.id === locale.value));

  function select(id: string) {
    if (supported.includes(id as WebsiteLocale)) {
      setLocale(id as WebsiteLocale);
      open.value = false;
    }
  }

  onClickOutside(wrapRef, () => { open.value = false; });

  return { locale, wrapRef, open, options, currentOption, select };
}
