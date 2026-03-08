import type { RouteRecordRaw } from "vue-router";
import DefaultLayout from "../layouts/DefaultLayout.vue";
import AppLayout from "../layouts/AppLayout.vue";
export { DefaultLayout, AppLayout };
/** App starts at login; root and unknown paths send unauthenticated users to /login. */
export declare const routes: RouteRecordRaw[];
/** App layout nav: one source of truth for sidebar/drawer links; derived from routes. */
/** List/dashboard routes only (no detail routes like /leads/:id). */
export declare const appNavRoutes: {
    path: string;
    name: string;
}[];
/** Home path for app layout (logo link). Same as first app nav route. */
export declare const appHomePath: string;
