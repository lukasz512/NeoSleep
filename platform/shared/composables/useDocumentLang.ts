import { watch, type Ref } from "vue";

export function useDocumentLang(locale: Ref<string>): void {
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
