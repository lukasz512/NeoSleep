import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendContactEmail } from "../mailer.js";
import { buildNewErrorEmail, notifyNewErrorKind, resetErrorEmailBudget } from "./issueNotifications.js";

vi.mock("../mailer.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../mailer.js")>()),
  sendContactEmail: vi.fn().mockResolvedValue(undefined),
}));

// The 2026-10-20 email: a frontend Vue error on pwa-dev, labelled "production"
// and with nothing that pointed at the component or page.
const frontendRow = {
  level: "error",
  message: "[vue:runtime-12] TypeError: can't access property \"value\", e is null",
  source: "frontend",
  env: "production",
  tenant_slug: "neosleep",
  stack: "y@https://pwa-dev.neosleepcare.com/assets/src.js:2:88130\nref@https://pwa-dev.neosleepcare.com/assets/src.js:2:91271\na\nb\nc\nd\ne",
  metadata: {
    where: "vue:runtime-12",
    url: "https://pwa-dev.neosleepcare.com/patients",
    app_version: "1.1.0",
    x_component: "AuthOrbs",
  },
};

describe("buildNewErrorEmail", () => {
  const now = new Date("2026-10-20T00:23:06.574Z");

  it("labels the subject with the deploy environment, not NODE_ENV", () => {
    expect(buildNewErrorEmail(frontendRow, "dev", now).subject).toMatch(/^\[NeoSleep dev\] New error: /);
    expect(buildNewErrorEmail(frontendRow, "prod", now).subject).toMatch(/^\[NeoSleep prod\] New error: /);
  });

  it("carries the component, page, app version and the top of the stack", () => {
    const rows = new Map(buildNewErrorEmail(frontendRow, "dev", now).rows);
    expect(rows.get("Component")).toBe("AuthOrbs");
    expect(rows.get("Page")).toBe("https://pwa-dev.neosleepcare.com/patients");
    expect(rows.get("App version")).toBe("1.1.0");
    expect(rows.get("Stack")?.split("\n")).toHaveLength(5);
    expect(rows.get("Stack")).toContain("ref@https://pwa-dev.neosleepcare.com/assets/src.js:2:91271");
  });

  it("falls back to the API path and dashes for an API error without frontend metadata", () => {
    const rows = new Map(
      buildNewErrorEmail({ level: "error", message: "boom", metadata: { path: "/api/v1/patients" } }, "prod", now).rows
    );
    expect(rows.get("Where")).toBe("/api/v1/patients");
    expect(rows.get("Page")).toBe("/api/v1/patients");
    expect(rows.get("Component")).toBe("-");
    expect(rows.get("Stack")).toBe("-");
  });
});

describe("notifyNewErrorKind (CORE-190 D4: only new prod API errors email right away)", () => {
  const isNew = { id: "d-1", isNew: true, hash: "h" };

  beforeEach(() => {
    resetErrorEmailBudget();
    vi.mocked(sendContactEmail).mockClear();
  });

  it("emails a new prod API error at once", () => {
    notifyNewErrorKind({ level: "error", message: "boom", source: "api", env: "prod" }, isNew);
    expect(sendContactEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves everything else to the morning digest", () => {
    notifyNewErrorKind({ level: "error", message: "boom", source: "frontend", env: "prod" }, isNew);
    notifyNewErrorKind({ level: "error", message: "boom", source: "api", env: "dev" }, isNew);
    notifyNewErrorKind({ level: "warn", message: "boom", source: "api", env: "prod" }, isNew);
    notifyNewErrorKind({ level: "error", message: "boom", source: "api", env: "prod" }, { ...isNew, isNew: false });
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});
