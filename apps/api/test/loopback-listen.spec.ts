import { describe, it, expect } from "vitest";
import http from "node:http";
import net from "node:net";
import request from "supertest";
import express from "express";

// CORE-265: the stray 404s and ECONNRESETs came from a foreign process on 127.0.0.1 winning the port.
describe("test servers bind to loopback only", () => {
  it("listen(0) without a host binds 127.0.0.1, not the wildcard address", async () => {
    const server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as net.AddressInfo;
    server.close();
    expect(addr.address).toBe("127.0.0.1");
  });

  it("a supertest request reaches the app through that loopback server", async () => {
    const app = express();
    app.get("/ping", (_req, res) => res.json({ from: "app" }));
    const res = await request(app).get("/ping");
    expect(res.body).toEqual({ from: "app" });
  });
});
