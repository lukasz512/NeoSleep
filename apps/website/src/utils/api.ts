import { createApiFetch, type ApiFetchOptions } from "@api";

export type { ApiFetchOptions };

export const apiFetch = createApiFetch({
  getApiBase: () => (import.meta.env.VITE_API_URL as string | undefined) ?? "",
});
