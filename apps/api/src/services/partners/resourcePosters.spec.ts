import { describe, it, expect, vi, afterEach } from "vitest";
import {
  __setPosterDepsForTests,
  frameTimestampSec,
  getPoster,
  knownDurationSec,
  parseDurationSec,
  type PosterDeps,
} from "./resourcePosters.js";

/**
 * No DB here — only the two outside boundaries are faked: the ffmpeg process
 * and Storage. The real ffmpeg path was checked by hand against apneadock.es
 * (NEO-151 artifact: ~5–7 s and ~22 KB per webinar).
 */
const SOURCE = { url: "https://apneadock.test/media/video/tutorials/a.mp4", headers: { Authorization: "Bearer x" }, version: "a.mp4:600" };

function fakeDeps(overrides: Partial<PosterDeps> = {}): PosterDeps {
  const runFfmpeg = vi.fn(async (args: string[]) =>
    args.includes("pipe:1")
      ? { code: 0, stdout: Buffer.from([0xff, 0xd8, 0xff]), stderr: "" }
      : { code: 1, stdout: Buffer.alloc(0), stderr: "  Duration: 00:44:12.40, start: 0.0, bitrate: 1200 kb/s" }
  );
  return {
    ffmpegPath: "/usr/bin/ffmpeg",
    resolveSource: vi.fn(async () => SOURCE),
    runFfmpeg,
    storageGet: vi.fn(async () => null),
    storagePut: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(() => __setPosterDepsForTests(null));

describe("parseDurationSec", () => {
  it("reads ffmpeg's input banner", () => {
    expect(parseDurationSec("Duration: 01:12:40.50, start")).toBe(4361);
  });
  it("returns null for streams without a duration", () => {
    expect(parseDurationSec("Duration: N/A, bitrate: N/A")).toBeNull();
  });
});

describe("frameTimestampSec", () => {
  it("takes the frame 10% in", () => {
    expect(frameTimestampSec(2652)).toBeCloseTo(265.2);
  });
  it("stays inside very short clips", () => {
    expect(frameTimestampSec(3)).toBe(1);
  });
  it("uses a fixed offset when the duration is unknown", () => {
    expect(frameTimestampSec(null)).toBe(5);
  });
});

describe("getPoster", () => {
  it("makes a poster once, stores it, and serves the second request from memory", async () => {
    const deps = fakeDeps();
    __setPosterDepsForTests(deps);

    const first = await getPoster("26", "mx");
    const second = await getPoster("26", "mx");

    expect(first?.durationSec).toBe(2652);
    expect(second).toBe(first);
    expect(knownDurationSec("26")).toBe(2652);
    expect(deps.runFfmpeg).toHaveBeenCalledTimes(2); // probe + grab, not repeated
    expect(deps.storagePut).toHaveBeenCalledWith(expect.stringMatching(/^resource-posters\/orthoapnea\/26\/[0-9a-f]{16}\.jpg$/), expect.any(Uint8Array), "image/jpeg");
  });

  it("seeks before -i so ffmpeg only fetches the bytes around the frame", async () => {
    const deps = fakeDeps();
    __setPosterDepsForTests(deps);
    await getPoster("26", "mx");

    const grabArgs = vi.mocked(deps.runFfmpeg).mock.calls[1]![0];
    expect(grabArgs.indexOf("-ss")).toBeLessThan(grabArgs.indexOf("-i"));
    expect(grabArgs[grabArgs.indexOf("-headers") + 1]).toBe("Authorization: Bearer x\r\n");
  });

  it("uses a stored poster without running ffmpeg", async () => {
    const deps = fakeDeps({
      storageGet: vi.fn(async (path: string) =>
        path.endsWith(".json") ? new TextEncoder().encode('{"durationSec":1815}') : new Uint8Array([1, 2, 3])
      ),
    });
    __setPosterDepsForTests(deps);

    const poster = await getPoster("28", "mx");
    expect(poster?.durationSec).toBe(1815);
    expect(deps.runFfmpeg).not.toHaveBeenCalled();
  });

  it("returns null without ffmpeg on the host", async () => {
    const deps = fakeDeps({ ffmpegPath: null });
    __setPosterDepsForTests(deps);
    expect(await getPoster("26", "mx")).toBeNull();
    expect(deps.resolveSource).not.toHaveBeenCalled();
  });

  it("returns null when the frame grab fails, and doesn't retry right away", async () => {
    const deps = fakeDeps({ runFfmpeg: vi.fn(async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: "403 Forbidden" })) });
    __setPosterDepsForTests(deps);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(await getPoster("26", "mx")).toBeNull();
    expect(await getPoster("26", "mx")).toBeNull();
    expect(deps.resolveSource).toHaveBeenCalledTimes(1);
  });

  it("still serves the poster when the Storage upload fails", async () => {
    const deps = fakeDeps({ storagePut: vi.fn(async () => Promise.reject(new Error("bucket down"))) });
    __setPosterDepsForTests(deps);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect((await getPoster("26", "mx"))?.jpeg.length).toBe(3);
  });

  it("shares one generation between concurrent requests", async () => {
    const deps = fakeDeps();
    __setPosterDepsForTests(deps);
    const [a, b] = await Promise.all([getPoster("26", "mx"), getPoster("26", "mx")]);
    expect(a).toBe(b);
    expect(deps.runFfmpeg).toHaveBeenCalledTimes(2);
  });
});
