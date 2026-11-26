import { describe, it, expect } from "vitest";
import express from "express";
import multer from "multer";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId.js";
import { requestContextMiddleware, currentRequestContext } from "./requestContext.js";

function buildApp(): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(requestIdMiddleware);
  app.use(express.json());
  app.use(requestContextMiddleware);
  const upload = multer({ storage: multer.memoryStorage() });
  app.post("/json", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    res.json(currentRequestContext());
  });
  app.post("/upload", upload.single("file"), requestContextMiddleware, async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    res.json(currentRequestContext());
  });
  app.post("/after-response", async (_req, res) => {
    res.status(201).end();
    // Post-commit work (e.g. the appointment email) runs after the response.
    await new Promise((resolve) => setTimeout(resolve, 5));
    lastAfterResponse = currentRequestContext();
  });
  return app;
}

let lastAfterResponse: ReturnType<typeof currentRequestContext> = null;

describe("requestContext", () => {
  it("is null outside a request (background jobs)", () => {
    expect(currentRequestContext()).toBeNull();
  });

  it("survives the JSON body parser and awaits in the handler", async () => {
    const res = await request(buildApp())
      .post("/json")
      .set("X-Request-ID", "req-json-1")
      .set("X-Forwarded-For", "203.0.113.7")
      .set("User-Agent", "Vitest/1.0")
      .send({ a: 1 });
    expect(res.body).toEqual({ requestId: "req-json-1", ip: "203.0.113.7", userAgent: "Vitest/1.0", jurisdiction: null });
  });

  it("survives a multer upload when re-entered after it", async () => {
    const res = await request(buildApp())
      .post("/upload")
      .set("X-Request-ID", "req-upload-1")
      .attach("file", Buffer.from("%PDF-1.4"), "a.pdf");
    expect(res.body.requestId).toBe("req-upload-1");
  });

  it("is still there after the response is sent", async () => {
    await request(buildApp()).post("/after-response").set("X-Request-ID", "req-after-1");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(lastAfterResponse?.requestId).toBe("req-after-1");
  });
});
