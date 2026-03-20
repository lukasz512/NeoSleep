import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";
import AboutView from "../views/AboutView.vue";
import ContactView from "../views/ContactView.vue";
import PrivacyView from "../views/PrivacyView.vue";
import HelpView from "../views/HelpView.vue";
import CareersView from "../views/CareersView.vue";
import ForPatientsView from "../views/ForPatientsView.vue";
import ForProfessionalsView from "../views/ForProfessionalsView.vue";
import FindSpecialistView from "../views/FindSpecialistView.vue";

const routes: RouteRecordRaw[] = [
  { path: "/", name: "home", component: HomeView, meta: { layout: "default" } },
  { path: "/about", name: "about", component: AboutView, meta: { layout: "default" } },
  { path: "/contact", name: "contact", component: ContactView, meta: { layout: "default" } },
  { path: "/privacy", name: "privacy", component: PrivacyView, meta: { layout: "default" } },
  { path: "/help", name: "help", component: HelpView, meta: { layout: "default" } },
  { path: "/careers", name: "careers", component: CareersView, meta: { layout: "default" } },
  { path: "/for-patients", name: "for-patients", component: ForPatientsView, meta: { layout: "default" } },
  { path: "/for-professionals", name: "for-professionals", component: ForProfessionalsView, meta: { layout: "default" } },
  { path: "/for-dentists", redirect: "/for-professionals" },
  { path: "/find-specialist", name: "find-specialist", component: FindSpecialistView, meta: { layout: "default" } },
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
