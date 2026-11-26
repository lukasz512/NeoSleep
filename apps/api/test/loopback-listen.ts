import http from "node:http";
import net from "node:net";

// CORE-265: supertest starts the app with `listen(0)`, which binds the wildcard address `::`, and then
// connects to 127.0.0.1:<port>. libuv sets SO_REUSEADDR, and on macOS a wildcard bind and a 127.0.0.1 bind
// can then share one port, with the more specific one winning. Any other local process on 127.0.0.1 (a dev
// server, another session) that holds the same ephemeral port answers our request: a stray 404, or
// ECONNRESET. Binding the test server to 127.0.0.1 itself makes the port exclusive.
//
// supertest reads server.address() synchronously, and `listen(0, "127.0.0.1")` resolves the host
// asynchronously, so the loopback handle is created up front with Node's `net._createServerHandle`
// (undocumented but long-stable) and handed to listen().
type CreateServerHandle = (address: string, port: number, addressType: 4 | 6) => object | number;
const createServerHandle = (net as unknown as { _createServerHandle?: CreateServerHandle })._createServerHandle;

const originalListen = http.Server.prototype.listen as (this: http.Server, ...args: unknown[]) => http.Server;

http.Server.prototype.listen = function patchedListen(this: http.Server, ...args: unknown[]): http.Server {
  if (createServerHandle && args[0] === 0 && (args.length === 1 || typeof args[1] === "function")) {
    const handle = createServerHandle("127.0.0.1", 0, 4);
    // A number is an errno: fall back to the default bind rather than failing the test.
    if (typeof handle !== "number") return originalListen.call(this, handle, ...args.slice(1));
  }
  return originalListen.apply(this, args);
} as typeof http.Server.prototype.listen;
