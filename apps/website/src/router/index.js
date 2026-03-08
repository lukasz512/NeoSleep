import { createRouter, createWebHistory } from "vue-router";
import DefaultLayout from "../layouts/DefaultLayout.vue";
import HomeView from "../views/HomeView.vue";
import AboutView from "../views/AboutView.vue";
const routes = [
    {
        path: "/",
        name: "home",
        component: HomeView,
        meta: { layout: "default" },
    },
    {
        path: "/about",
        name: "about",
        component: AboutView,
        meta: { layout: "default" },
    },
    {
        path: "/:pathMatch(.*)*",
        redirect: "/",
    },
];
const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
});
export default router;
export { DefaultLayout };
