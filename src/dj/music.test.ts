import { describe, expect, it } from "vitest";

import {
  BARS,
  deckEnvelope,
  DECKS,
  loopLength,
  renderDeck,
  STEPS,
  STYLE,
  STYLES,
} from "./music";

const RATE = 8000;

describe("the loops", () => {
  STYLES.forEach((id) => {
    DECKS.forEach((deck) => {
      it(`${id} deck ${deck}: four bars, finite, not silent, not clipping`, () => {
        const l = renderDeck(id, deck, RATE);
        expect(l.left.length).toBe(
          Math.round(loopLength(STYLE[id].bpm) * RATE),
        );
        let peak = 0;
        let sum = 0;
        for (let i = 0; i < l.left.length; i += 1) {
          expect(Number.isFinite(l.left[i])).toBe(true);
          expect(Number.isFinite(l.right[i])).toBe(true);
          peak = Math.max(peak, Math.abs(l.left[i]), Math.abs(l.right[i]));
          sum += l.left[i] * l.left[i];
        }
        expect(peak).toBeLessThanOrEqual(1);
        expect(peak).toBeGreaterThan(0.3);
        expect(Math.sqrt(sum / l.left.length)).toBeGreaterThan(0.02);
      });
    });
  });

  it("every pattern has a step for each sixteenth", () => {
    STYLES.forEach((id) => {
      const s = STYLE[id];
      [
        s.kick,
        s.snare,
        s.clap,
        s.hat,
        s.open,
        s.shaker,
        s.bass,
        s.chordHits,
        s.lead,
      ].forEach((line) => expect(line.length).toBe(STEPS));
      expect(s.chords.length).toBe(BARS);
      expect(s.roots.length).toBe(BARS);
    });
  });

  it("the beat deck's low end peaks on the kicks", () => {
    const at = 0.01;
    expect(deckEnvelope("house", "B", at).low).toBeGreaterThan(0.8);
    const offBeat = (60 / STYLE.house.bpm) * 0.75;
    expect(deckEnvelope("house", "B", offBeat).low).toBeLessThan(0.4);
    // Wraps round the loop.
    const len = loopLength(STYLE.house.bpm);
    expect(deckEnvelope("house", "B", len + at).low).toBeCloseTo(
      deckEnvelope("house", "B", at).low,
    );
  });
});
