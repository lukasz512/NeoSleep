import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { APP_STORAGE_KEYS } from "../constants";
import type { UserRole } from "./auth";

/**
 * Admin-only "view as" toggle — lets an admin see what the sidebar looks like
 * for another role. Display-only: it never touches the session or any API
 * call, which always runs with the admin's real permissions.
 *
 * Persisted to localStorage (not just in-memory) so it survives a manually
 * typed URL or a page reload while testing — otherwise every navigation that
 * isn't an in-app link click would silently reset it back to "admin".
 */
export const useRolePreviewStore = defineStore("rolePreview", () => {
  const previewRole = useLocalStorage<UserRole | null>(APP_STORAGE_KEYS.rolePreview, null);

  function setPreviewRole(role: UserRole | null): void {
    previewRole.value = role;
  }

  return { previewRole, setPreviewRole };
});
