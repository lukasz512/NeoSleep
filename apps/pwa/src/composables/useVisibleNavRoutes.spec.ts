import { describe, it, expect, vi, afterEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import en from "@i18n/en.json";
import { useVisibleNavRoutes } from "./useVisibleNavRoutes";
import { __resetPlatformAdminForTests } from "./usePlatformAdmin";
import { useAuthStore } from "../stores/auth";

/** CORE-177: the work board nav entry shows only for platform admins. */
const fetchPlatformAdmin = vi.fn<() => Promise<boolean>>();
vi.mock("./useIssues", () => ({ fetchPlatformAdmin: () => fetchPlatformAdmin() }));

afterEach(() => {
  __resetPlatformAdminForTests();
  fetchPlatformAdmin.mockReset();
});

async function navPathsFor(platformAdmin: boolean): Promise<string[]> {
  fetchPlatformAdmin.mockResolvedValue(platformAdmin);
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.$patch({ user: { id: "u-1", role: "admin" } } as never);
  let paths: string[] = [];
  const Probe = defineComponent({
    setup() {
      const { visibleNavRoutes } = useVisibleNavRoutes();
      return () => {
        paths = visibleNavRoutes.value.map((r) => r.path);
        return h("div");
      };
    },
  });
  const wrapper = mount(Probe, { global: { plugins: [createI18n({ legacy: false, locale: "en", messages: { en } })] } });
  await flushPromises();
  wrapper.unmount();
  return paths;
}

describe("useVisibleNavRoutes · platformOnly", () => {
  it("hides the work board from a tenant admin", async () => {
    expect(await navPathsFor(false)).not.toContain("/platform/board");
  });

  it("shows the work board to a platform admin", async () => {
    expect(await navPathsFor(true)).toContain("/platform/board");
  });
});
