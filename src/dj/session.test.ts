import { describe, expect, it } from "vitest";

import { ROUTINES, routineById, ZONE_CUES } from "./routines";
import { Session, starsFor, WINDOW } from "./session";

const SPB = 0.5;

describe("the routines", () => {
  it("are 8–16 bars, cues in order and inside", () => {
    ROUTINES.forEach((r) => {
      expect(r.bars).toBeGreaterThanOrEqual(8);
      expect(r.bars).toBeLessThanOrEqual(16);
      r.cues.forEach((c, i) => {
        expect(c.beat).toBeLessThan(r.bars * 4);
        if (i) expect(c.beat).toBeGreaterThan(r.cues[i - 1].beat);
      });
    });
  });
});

describe("Learn", () => {
  it("waits for each cue, in order", () => {
    const r = routineById("warm-up")!;
    const s = new Session(r, "learn", 0, SPB);
    s.action("fill", 1); // not yet
    expect(s.next).toBe(0);
    s.update(2, 0.1, 0); // crossfader to A
    expect(s.next).toBe(1);
    s.update(3, 0.9, 0);
    s.update(4, 0.5, 0);
    s.update(5, 0.5, -0.8);
    s.update(6, 0.5, 0);
    s.action("fill", 7);
    s.update(7, 0.5, 0);
    expect(s.done).toBe(true);
    expect(s.results.every((x) => x === "good")).toBe(true);
  });
});

describe("Play", () => {
  const r = routineById("first-scratch")!;
  it("judges on time, early and late, and misses", () => {
    const s = new Session(r, "play", 10, SPB);
    const t = (i: number) => s.timeOf(i);
    s.action("scratch", t(0) + 0.05);
    s.action("scratch", t(1) - WINDOW.early + 0.05);
    s.update(t(3) + WINDOW.late + 0.01, 0.5, 0);
    expect(s.results.slice(0, 4)).toEqual(["perfect", "good", "miss", "miss"]);
  });
  it("finishes with stars", () => {
    const s = new Session(r, "play", 10, SPB);
    r.cues.forEach((c, i) => s.action(c.kind, s.timeOf(i)));
    s.update(s.t0 + r.bars * 4 * SPB + 1, 0.5, 0);
    expect(s.done).toBe(true);
    expect(s.stars).toBe(3);
    expect(starsFor(["miss", "miss", "good"])).toBe(1);
  });
  it("a zone held as the window opens counts", () => {
    const w = routineById("warm-up")!;
    const s = new Session(w, "play", 0, SPB);
    s.update(s.timeOf(0) - WINDOW.early + 0.01, 0.05, 0);
    expect(s.results[0]).toBe("good");
    expect(ZONE_CUES.xfadeA!(0.05, 0)).toBe(true);
  });
});
