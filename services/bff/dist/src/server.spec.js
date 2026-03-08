import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "./server";
describe("BFF", () => {
    it("GET /health returns ok", async () => {
        const res = await request(app).get("/health");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true });
    });
    it("GET /api/leads returns 200 and paginated leads (mock when no DB)", async () => {
        const res = await request(app).get("/api/leads");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("items");
        expect(res.body).toHaveProperty("total");
        expect(Array.isArray(res.body.items)).toBe(true);
        expect(typeof res.body.total).toBe("number");
        res.body.items.forEach((lead) => {
            expect(typeof lead.id).toBe("string");
            expect(typeof lead.name).toBe("string");
            expect(typeof lead.email).toBe("string");
            expect(typeof lead.status).toBe("string");
            expect(typeof lead.region).toBe("string");
            expect(typeof lead.created_at).toBe("string");
        });
    });
    it("GET /api/leads accepts pagination and filter query params", async () => {
        const res = await request(app).get("/api/leads?page=2&limit=2&sortBy=name&sortOrder=asc&search=alpha&status=qualified");
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("items");
        expect(res.body).toHaveProperty("total");
        expect(Array.isArray(res.body.items)).toBe(true);
    });
    it("GET /api/leads applies status filter server-side (only matching items returned)", async () => {
        const res = await request(app).get("/api/leads?status=qualified");
        expect(res.status).toBe(200);
        expect(res.body.items).toBeDefined();
        expect(res.body.total).toBeGreaterThanOrEqual(0);
        res.body.items.forEach((lead) => {
            expect(lead.status).toBe("qualified");
        });
    });
    it("GET /api/leads applies region filter server-side", async () => {
        const res = await request(app).get("/api/leads?region=Central");
        expect(res.status).toBe(200);
        res.body.items.forEach((lead) => {
            expect(lead.region).toBe("Central");
        });
    });
    it("GET /api/leads applies search filter server-side (name/email/status/region)", async () => {
        const res = await request(app).get("/api/leads?search=alpha");
        expect(res.status).toBe(200);
        expect(res.body.total).toBeGreaterThanOrEqual(0);
        const q = "alpha";
        res.body.items.forEach((lead) => {
            const match = (lead.name && lead.name.toLowerCase().includes(q)) ||
                (lead.email && lead.email.toLowerCase().includes(q)) ||
                (lead.status && lead.status.toLowerCase().includes(q)) ||
                (lead.region && lead.region.toLowerCase().includes(q));
            expect(match).toBe(true);
        });
    });
});
