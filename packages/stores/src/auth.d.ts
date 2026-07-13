import type { ApiFetchOptions } from "@api";
export type UserRole = "admin" | "ffm" | "kam" | "msl" | "rep";
export interface AuthUser {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    role?: UserRole;
    tenant?: string;
}
type ApiFetchFn = (path: string, options?: ApiFetchOptions) => Promise<Response>;
/**
 * Auth store — session-cookie based.
 *
 * The BFF (services/api) owns the session: it sets an httpOnly cookie on login
 * and reads it via express-session on every request. This store just mirrors
 * that server-side state in memory — it holds no token, because there is none.
 *
 * Lifecycle:
 *   Login   → POST /auth/login  → { user, forcePasswordChange } (cookie set by browser)
 *   Reload  → fetchSession() calls GET /auth/session to rehydrate `user` from the cookie
 *   Logout  → POST /auth/logout (destroys server session) → clearAuth()
 */
export declare function createAuthStore(apiFetch: ApiFetchFn): import("pinia").StoreDefinition<"auth", Pick<{
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    isAuthenticated: import("vue").ComputedRef<boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    logout: () => Promise<void>;
    clearAuth: () => void;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
}, "user" | "sessionChecked">, Pick<{
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    isAuthenticated: import("vue").ComputedRef<boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    logout: () => Promise<void>;
    clearAuth: () => void;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
}, "isAuthenticated" | "displayName">, Pick<{
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
        tenant?: string | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    isAuthenticated: import("vue").ComputedRef<boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    logout: () => Promise<void>;
    clearAuth: () => void;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
}, "fetchSession" | "logout" | "clearAuth" | "setAuthenticated">>;
export {};
