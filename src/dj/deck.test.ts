import { describe, expect, it } from "vitest";

import { angleToMusic, DeckMotion, SPIN } from "./deck";

const run = (
  m: DeckMotion,
  seconds: number,
  slip: (t: number) => number | null,
  t0 = 0,
) => {
  const dt = 1 / 120;
  let t = t0;
  for (let i = 0; i < Math.round(seconds / dt); i += 1) {
    t += dt;
    m.step(dt, slip(t));
  }
  return t;
};

describe("a record", () => {
  it("plays with the beat", () => {
    const m = new DeckMotion();
    m.mode = "play";
    run(m, 2, (t) => t);
    expect(m.pos).toBeCloseTo(2, 3);
    expect(m.rate).toBe(1);
    expect(m.angle).toBeCloseTo(-2 * SPIN, 1);
  });

  it("brakes to a stop, and drops back on the beat when let go", () => {
    const m = new DeckMotion();
    m.mode = "play";
    let t = run(m, 1, (x) => x);
    m.mode = "brake";
    t = run(m, 2, (x) => x, t);
    expect(Math.abs(m.rate)).toBeLessThan(0.01);
    expect(m.pos).toBeLessThan(t - 1.5);
    const travel = m.travel;
    m.mode = "play";
    m.step(1 / 120, t + 1 / 120);
    expect(m.pos).toBeCloseTo(t + 1 / 120, 5);
    // The jump back doesn't spin the record.
    expect(Math.abs(m.travel - travel)).toBeLessThan(0.02);
  });

  it("follows a scratch forwards and back", () => {
    const m = new DeckMotion();
    m.mode = "play";
    const t = run(m, 1, (x) => x);
    m.mode = "scratch";
    const start = m.pos;
    m.target = start + angleToMusic(1);
    run(m, 0.4, (x) => x, t);
    expect(m.pos).toBeCloseTo(start + angleToMusic(1), 2);
    m.target = start - angleToMusic(0.5);
    run(m, 0.4, (x) => x, t);
    expect(m.pos).toBeCloseTo(start - angleToMusic(0.5), 2);
  });
});
