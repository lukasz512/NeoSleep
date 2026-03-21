import { createAuthStore } from "@neo/stores";
import { apiFetch } from "../utils/api";

export type { UserRole, AuthUser } from "@neo/stores";

export const useAuthStore = createAuthStore(apiFetch);
