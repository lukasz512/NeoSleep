import { createAuthStore } from "@stores";
import { apiFetch } from "../utils/api";

export type { UserRole, AuthUser } from "@stores";

export const useAuthStore = createAuthStore(apiFetch);
