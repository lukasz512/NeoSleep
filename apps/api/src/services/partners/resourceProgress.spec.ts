import { describe, it, expect } from "vitest";
import { nextProgress, type ProgressState } from "./resourceProgress.js";

/** NEO-209: how a playback report moves a video's watch status. */
const fresh: ProgressState = { status: "not_started", positionSec: 0, maxPositionSec: 0, durationSec: null, source: "watched" };

describe("nextProgress", () => {
  it("status thresholds: under 10 s stays not started, then in progress, 90 % is completed", () => {
    expect(nextProgress(fresh, { positionSec: 9, durationSec: 600 }).status).toBe("not_started");
    expect(nextProgress(fresh, { positionSec: 10, durationSec: 600 }).status).toBe("in_progress");
    expect(nextProgress(fresh, { positionSec: 539, durationSec: 600 }).status).toBe("in_progress");
    expect(nextProgress(fresh, { positionSec: 540, durationSec: 600 })).toMatchObject({ status: "completed", source: "watched" });
  });

  it("reaching the end completes a short video too", () => {
    expect(nextProgress(fresh, { positionSec: 30, durationSec: 30, ended: true }).status).toBe("completed");
  });

  it("completed is sticky: rewatching from the start does not drop it back", () => {
    const done = nextProgress(fresh, { positionSec: 600, durationSec: 600 });
    const rewatch = nextProgress(done, { positionSec: 20, durationSec: 600 });
    expect(rewatch.status).toBe("completed");
    expect(rewatch.positionSec).toBe(20);
  });

  it("percent counts the furthest point reached, not where the doctor seeked back to", () => {
    const far = nextProgress(fresh, { positionSec: 300, durationSec: 600 });
    const back = nextProgress(far, { positionSec: 60, durationSec: 600 });
    expect(back.maxPositionSec).toBe(300);
    expect(back.positionSec).toBe(60);
  });

  it("a manual 'visto' that is then really watched becomes source 'watched'", () => {
    const marked: ProgressState = { ...fresh, status: "completed", source: "marked" };
    expect(nextProgress(marked, { positionSec: 590, durationSec: 600 }).source).toBe("watched");
    expect(nextProgress(marked, { positionSec: 100, durationSec: 600 }).source).toBe("marked");
  });

  it("clamps nonsense input instead of storing it", () => {
    const r = nextProgress(fresh, { positionSec: 9999, durationSec: 600 });
    expect(r.positionSec).toBe(600);
    expect(nextProgress(fresh, { positionSec: -5, durationSec: 600 }).positionSec).toBe(0);
  });
});
