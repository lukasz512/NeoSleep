import { watch } from "vue";
import { useI18n } from "vue-i18n";

export function useDocumentLang(): void {
  const { locale } = useI18n();
  watch(
    locale,
    (lang) => {
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("lang", lang);
      }
    },
    { immediate: true },
  );
}
