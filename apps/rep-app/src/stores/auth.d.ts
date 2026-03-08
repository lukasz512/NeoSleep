export type UserRole = "admin" | "manager" | "rep";
export interface AuthUser {
    id: string;
    email: string;
    name?: string;
    picture?: string;
    role?: UserRole;
}
/**
 * Auth state for rep-app. Session is validated via BFF GET /auth/session.
 * Router guard calls fetchSession() before allowing access to protected routes.
 * In dev, "Login as" + "Go to app" can set authenticated without BFF.
 */
export declare const useAuthStore: import("pinia").StoreDefinition<"auth", Pick<{
    isAuthenticated: import("vue").Ref<boolean, boolean>;
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
    clearAuth: () => void;
}, "isAuthenticated" | "user" | "sessionChecked">, Pick<{
    isAuthenticated: import("vue").Ref<boolean, boolean>;
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
    clearAuth: () => void;
}, "displayName">, Pick<{
    isAuthenticated: import("vue").Ref<boolean, boolean>;
    user: import("vue").Ref<{
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null, AuthUser | {
        id: string;
        email: string;
        name?: string | undefined;
        picture?: string | undefined;
        role?: UserRole | undefined;
    } | null>;
    sessionChecked: import("vue").Ref<boolean, boolean>;
    displayName: import("vue").ComputedRef<string | null>;
    fetchSession: () => Promise<boolean>;
    setAuthenticated: (value: boolean, userData?: AuthUser | null) => void;
    clearAuth: () => void;
}, "fetchSession" | "setAuthenticated" | "clearAuth">>;
