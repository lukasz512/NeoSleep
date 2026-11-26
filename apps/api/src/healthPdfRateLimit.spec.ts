import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// CORE-265: the limit is a fixed 60 s window that opens on the first call. With three real Chromium
// renders inside it, a slow machine could outlive the window and never see the 429. The renderer is
// stubbed here (the real render is covered once in server.spec.ts), so the four calls take milliseconds.
vi.mock("./services/documentRenderer.js", () => ({
  renderHtmlToPdf: vi.fn(async () => new TextEncoder().encode("%PDF-1.7 stub")),
}));

const { app } = await import("./server");

describe("GET /health/pdf rate limit", () => {
  it("allows three calls a minute and refuses the fourth with 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await request(app).get("/health/pdf")).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});
