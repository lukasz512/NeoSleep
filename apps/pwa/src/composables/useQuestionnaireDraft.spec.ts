import { describe, it, expect, afterEach, vi } from "vitest";
import { draftKeyFor, purgeExpiredDrafts, useQuestionnaireDraft, DRAFT_TTL_MS } from "./useQuestionnaireDraft";

const TOKEN = "t".repeat(43);
const answers = { snoring: true, tiredness: null };

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useQuestionnaireDraft", () => {
  it("never writes the link token to storage — only a short hash of it", async () => {
    const key = await draftKeyFor(TOKEN);
    expect(key).toMatch(/^app-q-draft:[0-9a-f]{16}$/);
    useQuestionnaireDraft(key).save("stopBang", { answers, other: "", cursor: 1 });
    const everything = Object.keys(localStorage).join() + Object.values(localStorage).join();
    expect(everything).not.toContain(TOKEN);
  });

  it("restores a step's draft and forgets it once that step is submitted", async () => {
    const draft = useQuestionnaireDraft(await draftKeyFor(TOKEN));
    draft.save("stopBang", { answers, other: "", cursor: 1 });
    draft.save("medicalHistory", { answers: { has_anemia: false }, other: "asma", cursor: 3 });
    expect(draft.load("stopBang")).toMatchObject({ answers, cursor: 1 });

    draft.clearStep("stopBang");
    expect(draft.load("stopBang")).toBeNull();
    expect(draft.load("medicalHistory")).toMatchObject({ other: "asma" });
  });

  it("drops everything of a dead link, and anything older than 24 h", async () => {
    const key = await draftKeyFor(TOKEN);
    const draft = useQuestionnaireDraft(key);
    draft.save("stopBang", { answers, other: "", cursor: 1 });
    draft.clearAll();
    expect(localStorage.getItem(key)).toBeNull();

    const now = Date.now();
    draft.save("stopBang", { answers, other: "", cursor: 1 }, now - DRAFT_TTL_MS - 1);
    expect(draft.load("stopBang", now)).toBeNull();
    purgeExpiredDrafts(now);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("keeps working when storage throws (private mode, blocked site data)", async () => {
    const draft = useQuestionnaireDraft(await draftKeyFor(TOKEN));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => draft.save("stopBang", { answers, other: "", cursor: 1 })).not.toThrow();
    expect(draft.load("stopBang")).toBeNull();
    expect(() => purgeExpiredDrafts()).not.toThrow();
  });
});
