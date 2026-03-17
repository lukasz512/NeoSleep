import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";
import AboutView from "../views/AboutView.vue";
import ContactView from "../views/ContactView.vue";
import PrivacyView from "../views/PrivacyView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView, meta: { layout: "default" } },
  { path: "/about", name: "about", component: AboutView, meta: { layout: "default" } },
  { path: "/contact", name: "contact", component: ContactView, meta: { layout: "default" } },
  { path: "/privacy", name: "privacy", component: PrivacyView, meta: { layout: "default" } },
  {
    path: "/:pathMatch(.*)*",
    redirect: "/",
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0, behavior: "instant" }),
});

export default router;
