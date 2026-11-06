import { describe, expect, it } from "vitest";

import { DROP, HandDj, MIXER, type HandIn, type HandsOut } from "./handPlay";
import type { Sign } from "./signs";

const FPS = 30;
const hand = (x: number, y: number, sign: Sign = "open"): HandIn => ({
  palm: { x, y },
  sign,
  raw: sign,
});

/** Runs readings for `seconds`; `at(t)` gives both hands. */
const run = (
  p: HandDj,
  t0: number,
  seconds: number,
  at: (t: number) => { deck: HandIn | null; mixer: HandIn | null },
) => {
  const outs: HandsOut[] = [];
  for (let k = 0; k < Math.round(seconds * FPS); k += 1) {
    const t = t0 + k / FPS;
    outs.push(p.update({ t, ...at(t - t0) }));
  }
  return outs;
};

describe("the deck hand", () => {
  it("a still open palm lets the record play", () => {
    const outs = run(new HandDj(), 0, 2, () => ({
      deck: hand(0.7, 0.5),
      mixer: null,
    }));
    expect(outs.every((o) => o.scratch === null && !o.brake)).toBe(true);
  });

  it("swishing scratches (right pulls back), and stopping drops back", () => {
    const p = new HandDj();
    run(p, 0, 0.5, () => ({ deck: hand(0.7, 0.5), mixer: null }));
    const moving = run(p, 0.5, 0.6, (t) => ({
      deck: hand(0.7 + 0.15 * Math.sin(2 * Math.PI * 1.5 * t), 0.5),
      mixer: null,
    }));
    expect(moving.some((o) => o.scratch !== null)).toBe(true);
    // Moving right turns the record back.
    const firstRight = moving.findIndex((o) => o.scratch !== null);
    expect(moving[firstRight + 3].scratch!).toBeLessThan(0);
    const still = run(p, 1.1, 0.6, () => ({
      deck: hand(0.75, 0.5),
      mixer: null,
    }));
    expect(still[still.length - 1].scratch).toBeNull();
  });

  it("a fist brakes; opening lets go", () => {
    const p = new HandDj();
    const f = run(p, 0, 0.3, () => ({
      deck: hand(0.7, 0.5, "fist"),
      mixer: null,
    }));
    expect(f[f.length - 1].brake).toBe(true);
    const o = run(p, 0.3, 0.1, () => ({ deck: hand(0.7, 0.5), mixer: null }));
    expect(o[o.length - 1].brake).toBe(false);
  });
});

describe("signs", () => {
  it("a held sign fires its pad once", () => {
    const p = new HandDj();
    const outs = run(p, 0, 1.5, () => ({
      deck: null,
      mixer: hand(0.3, 0.6, "two"),
    }));
    expect(outs.flatMap((o) => o.pads)).toEqual([2]);
    // Another sign, then back: fires again.
    run(p, 1.5, 0.3, () => ({ deck: null, mixer: hand(0.3, 0.6, "open") }));
    const again = run(p, 1.8, 0.5, () => ({
      deck: null,
      mixer: hand(0.3, 0.6, "two"),
    }));
    expect(again.flatMap((o) => o.pads)).toEqual([2]);
  });

  it("a moving hand fires nothing", () => {
    const outs = run(new HandDj(), 0, 1.5, (t) => ({
      deck: hand(0.7 + 0.2 * Math.sin(8 * t), 0.5, "one"),
      mixer: null,
    }));
    expect(outs.flatMap((o) => o.pads)).toEqual([]);
  });
});

describe("the mixer hand", () => {
  it("takes over after a moment, then follows across and up", () => {
    const p = new HandDj();
    const early = run(p, 0, MIXER.grab * 0.8, () => ({
      deck: null,
      mixer: hand(0.08, 0.2),
    }));
    expect(early.every((o) => o.xfade === null)).toBe(true);
    const later = run(p, MIXER.grab * 0.8, 2, () => ({
      deck: null,
      mixer: hand(0.08, 0.2),
    }));
    const last = later[later.length - 1];
    expect(last.xfade!).toBeLessThan(0.05);
    expect(last.filter!).toBeGreaterThan(0.85);
    // The middle band is open; low down is low-pass.
    const mid = run(p, 2.5, 1.5, () => ({
      deck: null,
      mixer: hand(0.33, 0.56),
    }));
    expect(mid[mid.length - 1].filter!).toBeCloseTo(0, 2);
    expect(mid[mid.length - 1].xfade!).toBeCloseTo(0.5, 2);
    const low = run(p, 4, 1.5, () => ({ deck: null, mixer: hand(0.33, 0.95) }));
    expect(low[low.length - 1].filter!).toBeLessThan(-0.9);
  });

  it("lost, it glides back to the middle", () => {
    const p = new HandDj();
    run(p, 0, 2, () => ({ deck: null, mixer: hand(0.55, 0.2) }));
    const gone = run(p, 2, 4, () => ({ deck: null, mixer: null }));
    const settled = gone.filter((o) => o.xfade !== null).pop()!;
    expect(settled.xfade).toBeCloseTo(0.5, 2);
    expect(settled.filter).toBeCloseTo(0, 2);
    expect(gone[gone.length - 1].xfade).toBeNull();
  });
});

describe("the drop", () => {
  it("both palms up, held, then pulled down fast", () => {
    const p = new HandDj();
    run(p, 0, 0.6, () => ({ deck: hand(0.7, 0.15), mixer: hand(0.3, 0.15) }));
    const down = run(p, 0.6, 0.4, (t) => {
      const y = Math.min(0.8, 0.15 + 2.5 * t);
      return { deck: hand(0.7, y), mixer: hand(0.3, y) };
    });
    expect(down.filter((o) => o.drop).length).toBe(1);
  });

  it("not when the palms come down slowly, or one at a time", () => {
    const p = new HandDj();
    run(p, 0, 0.6, () => ({ deck: hand(0.7, 0.15), mixer: hand(0.3, 0.15) }));
    const slow = run(p, 0.6, 2, (t) => {
      const y = 0.15 + 0.3 * t;
      return { deck: hand(0.7, y), mixer: hand(0.3, y) };
    });
    expect(slow.some((o) => o.drop)).toBe(false);
    const q = new HandDj();
    run(q, 0, 0.6, () => ({ deck: hand(0.7, 0.15), mixer: hand(0.3, 0.15) }));
    const one = run(q, 0.6, 0.5, (t) => ({
      deck: hand(0.7, Math.min(0.8, 0.15 + 2.5 * t)),
      mixer: hand(0.3, 0.15),
    }));
    expect(one.some((o) => o.drop)).toBe(false);
  });

  it("palms up too briefly don't arm it", () => {
    const p = new HandDj();
    run(p, 0, DROP.hold * 0.5, () => ({
      deck: hand(0.7, 0.15),
      mixer: hand(0.3, 0.15),
    }));
    const down = run(p, DROP.hold * 0.5, 0.4, (t) => {
      const y = Math.min(0.8, 0.15 + 2.5 * t);
      return { deck: hand(0.7, y), mixer: hand(0.3, y) };
    });
    expect(down.some((o) => o.drop)).toBe(false);
  });
});
