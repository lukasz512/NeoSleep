import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { setActivePinia, createPinia } from "pinia";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import en from "@i18n/en.json";
import WorkItemDialog from "./WorkItemDialog.vue";
import type { WorkAttachment, WorkItem, WorkTeam } from "../../types/workBoard";

/** Work item dialog, variant A (CORE-192): chips, sections on demand, paste/drop/pick attachments. */
const apiFetch = vi.fn();
vi.mock("../../composables/useApi", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const TEAMS: WorkTeam[] = [{ key: "CORE", name: "NeoCRM Core", kind: "platform" }];
const ME = { email: "lukasz@neosleepcare.com", name: "Łukasz" };

function item(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: "item-1",
    key: "CORE-9",
    team_key: "CORE",
    number: 9,
    title: "Paste does not work",
    problem: "Nothing happens",
    change: null,
    done_when: null,
    status: "backlog",
    priority: 0,
    labels: [],
    links: [],
    branch: null,
    assignee: null,
    due_date: null,
    source: "manual",
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    status_changed_at: "2026-11-10T10:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

function attachment(overrides: Partial<WorkAttachment> = {}): WorkAttachment {
  return {
    id: "att-1",
    item_id: "item-1",
    event_id: null,
    filename: "shot.png",
    mime_type: "image/png",
    size_bytes: 10,
    uploaded_by: ME.email,
    created_at: "2026-11-10T10:00:00Z",
    ...overrides,
  };
}

function ok(body: unknown, status = 200): Response {
  return { ok: true, status, json: async () => body } as Response;
}

interface Call { path: string; method: string; body: unknown }
const calls: Call[] = [];

function serve(current: WorkItem | null, extra: WorkAttachment[] = []): void {
  let n = 0;
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ path, method, body: init?.body });
    if (path.endsWith("/people")) return ok({ items: [ME] });
    if (path.endsWith("/attachments") && method === "POST") {
      const data = init!.body as FormData;
      const f = data.get("file") as File;
      const comment = data.get("comment");
      return ok({ attachment: attachment({ id: `new-${++n}`, filename: f.name, mime_type: f.type, event_id: comment ? String(comment) : null }) }, 201);
    }
    if (/\/attachments\/[^/]+$/.test(path)) return ok({ url: `https://signed.test/${path.split("/").pop()}`, expires_in: 600 });
    if (path.endsWith("/comments")) {
      return ok({ event: { id: "77", kind: "comment", from_status: null, to_status: null, body: "see", actor: ME.email, actor_kind: "human", created_at: "2026-11-10T11:00:00Z" } }, 201);
    }
    if (path.endsWith("/items") && method === "POST") return ok({ item: item({ key: "CORE-10", ...JSON.parse(String(init!.body)) }) }, 201);
    if (method === "PATCH") return ok({ item: { ...current!, ...JSON.parse(String(init!.body)) } });
    return ok({ item: current, events: [], attachments: extra });
  });
}

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  apiFetch.mockReset();
  calls.length = 0;
});

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

async function render(props: { itemKey: string | null; creating: boolean }) {
  setActivePinia(createPinia());
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const wrapper = mount(WorkItemDialog, {
    props: { ...props, teams: TEAMS, defaultTeam: "CORE" },
    global: { plugins: [i18n, vuetify] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const q = (id: string) => document.querySelector(`[data-testid='${id}']`);

function png(name = "image.png"): File {
  return new File(["png"], name, { type: "image/png" });
}

async function paste(target: Element, files: File[]): Promise<void> {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files, items: [] } });
  target.dispatchEvent(event);
  await flushPromises();
}

async function drop(target: Element, files: File[]): Promise<void> {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files, items: [] } });
  target.dispatchEvent(event);
  await flushPromises();
}

const uploads = () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/attachments"));

describe("WorkItemDialog (CORE-192)", () => {
  it("shows the title, the chip row and adds Change / Done when with one click", async () => {
    serve(null);
    await render({ itemKey: null, creating: true });
    const chips = q("work-item-chips")!.textContent!;
    for (const text of ["CORE", "Backlog", "Unassigned", "No due date"]) expect(chips).toContain(text);
    expect(q("work-item-title")).not.toBeNull();
    const section = () => q("work-item-change")!.closest(".work-dialog__section") as HTMLElement;
    expect(section().style.display).toBe("none");
    (q("work-item-add-change") as HTMLButtonElement).click();
    await flushPromises();
    expect(section().style.display).not.toBe("none");
    expect(q("work-item-add-change")).toBeNull();
  });

  it("queues a pasted screenshot on a new item and uploads it right after Create", async () => {
    serve(null);
    const wrapper = await render({ itemKey: null, creating: true });
    await paste(q("work-item-problem")!.querySelector("textarea")!, [png()]);
    expect(document.querySelectorAll("[data-testid='work-item-pending']")).toHaveLength(1);
    expect(uploads()).toHaveLength(0);

    const title = q("work-item-title")!.querySelector("textarea")!;
    title.value = "Paste is broken";
    title.dispatchEvent(new Event("input"));
    await flushPromises();
    (q("work-item-save") as HTMLButtonElement).click();
    await flushPromises();

    expect(uploads()).toHaveLength(1);
    expect(uploads()[0]!.path).toContain("/items/CORE-10/attachments");
    expect(((uploads()[0]!.body as FormData).get("file") as File).name).toMatch(/^screenshot-.*\.png$/);
    expect(wrapper.emitted("saved")?.[0]?.[0]).toMatchObject({ key: "CORE-10" });
  });

  it("uploads a dropped file on an existing item at once and shows its thumbnail", async () => {
    serve(item());
    await render({ itemKey: "CORE-9", creating: false });
    await drop(q("work-item-dialog")!, [png("bug.png")]);
    expect(uploads()).toHaveLength(1);
    const tiles = document.querySelectorAll("[data-testid='work-item-attachment']");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]!.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/new-1");
    expect(document.querySelectorAll("[data-testid='work-item-pending']")).toHaveLength(0);
  });

  it("refuses a file that is not an image or PDF without sending anything", async () => {
    serve(item());
    await render({ itemKey: "CORE-9", creating: false });
    await paste(q("work-item-dialog")!, [new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]);
    expect(q("work-item-rejected")?.textContent).toContain("Only images and PDF");
    expect(uploads()).toHaveLength(0);
  });

  it("offers a picker limited to images and PDFs", async () => {
    serve(null);
    await render({ itemKey: null, creating: true });
    const input = q("work-item-file") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("image/*,application/pdf");
  });

  it("ties a screenshot pasted into the comment box to that comment", async () => {
    serve(item());
    await render({ itemKey: "CORE-9", creating: false });
    const box = q("work-item-comment")!.querySelector("textarea")!;
    await paste(box, [png()]);
    expect(q("work-item-comment-pending")).not.toBeNull();
    expect(uploads()).toHaveLength(0);
    box.value = "see";
    box.dispatchEvent(new Event("input"));
    await flushPromises();
    (q("work-item-comment-send") as HTMLButtonElement).click();
    await flushPromises();
    expect(uploads()).toHaveLength(1);
    expect((uploads()[0]!.body as FormData).get("comment")).toBe("77");
    expect(q("work-item-comment-pending")).toBeNull();
  });

  it("deletes an uploaded attachment", async () => {
    serve(item(), [attachment()]);
    await render({ itemKey: "CORE-9", creating: false });
    const remove = document.querySelector("[data-testid='work-item-attachment'] .work-dialog__file-remove") as HTMLButtonElement;
    remove.click();
    await flushPromises();
    expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/attachments/att-1"))).toBe(true);
    expect(document.querySelectorAll("[data-testid='work-item-attachment']")).toHaveLength(0);
  });

  it("shows the Development chip only when the item has links or a branch", async () => {
    serve(item());
    await render({ itemKey: "CORE-9", creating: false });
    expect(q("work-item-development")).toBeNull();
    for (const w of wrappers.splice(0)) w.unmount();

    serve(item({ links: [{ kind: "pr", url: "https://github.com/x/pull/1" }], branch: "worktree-core-9" }));
    await render({ itemKey: "CORE-9", creating: false });
    expect(q("work-item-development")?.textContent).toContain("Development · 2");
  });

  it("saves an assignee picked from the chip menu", async () => {
    serve(item());
    await render({ itemKey: "CORE-9", creating: false });
    (q("work-item-assignee") as HTMLElement).click();
    await flushPromises();
    const option = Array.from(document.querySelectorAll("[data-testid='work-item-assignee-menu'] .v-list-item")).find((el) => el.textContent?.includes("Łukasz"));
    (option as HTMLElement).click();
    await flushPromises();
    expect(q("work-item-assignee")?.textContent).toContain("Łukasz");
    (q("work-item-save") as HTMLButtonElement).click();
    await flushPromises();
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(JSON.parse(String(patch.body))).toEqual({ assignee: ME.email });
  });
});
