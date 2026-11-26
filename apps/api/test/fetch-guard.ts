/**
 * vitest setupFile: no spec may ever reach the real OrthoApnea. A local test
 * run sources the root .env, which holds the real ORTHOAPNEA_BASE_URL and the
 * shared account's credentials — one unmocked call would place a real,
 * billable order. Any fetch to a host containing "apneadock" throws instead.
 *
 * Specs that stub fetch (vi.stubGlobal) replace this wrapper and get it back
 * on vi.unstubAllGlobals(); specs that need OA behaviour use the replica
 * (test/oa-replica/server.ts) on 127.0.0.1.
 */
const realFetch = globalThis.fetch;

function hostOf(input: Parameters<typeof fetch>[0]): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return "";
  }
}

globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  if (hostOf(input).includes("apneadock")) {
    return Promise.reject(new Error(`fetch-guard: tests must never call the real OrthoApnea (${hostOf(input)}) — use test/oa-replica`));
  }
  return realFetch(input, init);
};
