import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineComponent, h } from "vue";
import { createMemoryHistory, createRouter, type RouteLocationNormalized } from "vue-router";
import { installPageTransitions, pageTransitionKind, pageTransitionsSupported } from "./pageTransitions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loc(name: string): RouteLocationNormalized {
  return { name, path: `/${name}`, matched: [], meta: { layout: "app" } } as unknown as RouteLocationNormalized;
}

describe("pageTransitionKind (NEO-85: record A, modules fade-through)", () => {
  it("list → one of its records is 'open', and the way back is 'back'", () => {
    expect(pageTransitionKind(loc("patients"), loc("patient-detail"))).toBe("open");
    expect(pageTransitionKind(loc("patient-detail"), loc("patients"))).toBe("back");
    expect(pageTransitionKind(loc("hco"), loc("hco-detail"))).toBe("open");
  });

  it("everything else — module switches, record → another module's record — is 'module'", () => {
    expect(pageTransitionKind(loc("patients"), loc("hcp"))).toBe("module");
    expect(pageTransitionKind(loc("patient-detail"), loc("hcp-detail"))).toBe("module");
    expect(pageTransitionKind(loc("patients"), loc("hcp-detail"))).toBe("module");
  });
});

const Stub = defineComponent({ render: () => h("div") });

// Same shape as router/routes.ts: flat routes, the shell chosen by meta.layout.
function appRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", name: "login", component: Stub, meta: { layout: "public" } },
      { path: "/patients", name: "patients", component: Stub, meta: { layout: "app" } },
      { path: "/patients/:id", name: "patient-detail", component: Stub, meta: { layout: "app" } },
      { path: "/hcp", name: "hcp", component: Stub, meta: { layout: "app" } },
    ],
  });
}

describe("installPageTransitions", () => {
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    delete document.documentElement.dataset.pageTransition;
  });

  it("does nothing where the browser has no View Transitions (AppLayout keeps its own fade)", async () => {
    expect(pageTransitionsSupported()).toBe(false);
    const router = appRouter();
    installPageTransitions(router);
    await router.push("/patients");
    await router.push("/patients/1");
    expect(document.documentElement.dataset.pageTransition).toBeUndefined();
  });

  it("wraps in-app page changes in a view transition, tagged with the kind of move", async () => {
    const kinds: (string | undefined)[] = [];
    const start = vi.fn((update: () => Promise<void>) => {
      kinds.push(document.documentElement.dataset.pageTransition);
      return { finished: update() };
    });
    (document as unknown as { startViewTransition: typeof start }).startViewTransition = start;
    const router = appRouter();
    installPageTransitions(router);

    await router.push("/login");
    await router.push("/patients"); // login → app: the shell has its own entrance
    expect(start).not.toHaveBeenCalled();

    await router.push("/patients/1");
    await router.push("/patients");
    await router.push("/hcp");
    await router.push("/hcp?search=mar"); // same page, only the query changes
    expect(kinds).toEqual(["open", "back", "module"]);
  });

  it("the new page's snapshot waits for the router to finish (the update resolves after the navigation)", async () => {
    let updateDone = false;
    (document as unknown as { startViewTransition: unknown }).startViewTransition = (update: () => Promise<void>) => {
      const finished = update().then(() => {
        updateDone = true;
      });
      return { finished };
    };
    const router = appRouter();
    installPageTransitions(router);
    await router.push("/patients");
    await router.push("/patients/1");
    await new Promise((r) => setTimeout(r, 0));
    expect(updateDone).toBe(true);
    expect(router.currentRoute.value.name).toBe("patient-detail");
  });
});

describe("page transition wiring", () => {
  it("only the content sheet is named for the transition, and main.ts loads the keyframes", () => {
    const layout = readFileSync(path.resolve(__dirname, "../layouts/AppLayout.vue"), "utf-8");
    expect(layout).toMatch(/\.layout-main__inner\s*{[^}]*view-transition-name:\s*pwa-page/);
    const main = readFileSync(path.resolve(__dirname, "../main.ts"), "utf-8");
    expect(main).toContain('import "./assets/page-transitions.css"');
    const css = readFileSync(path.resolve(__dirname, "../assets/page-transitions.css"), "utf-8");
    for (const kind of ["open", "back", "module"]) expect(css).toContain(`html[data-page-transition="${kind}"]`);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
