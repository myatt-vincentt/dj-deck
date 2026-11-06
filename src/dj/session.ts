// A routine being learnt or played (pure: times in seconds on the
// transport's clock).
//
// What you do arrives as actions (a scratch, a brake, a pad, the drop) and,
// each moment, the crossfader and filter (zone cues: done while they are in
// their zone).
//
// Learn waits for you at each cue (the music loops on); it counts once you
// do it. No timing, nothing to fail.
//
// Play runs the routine on the beat after a one-bar count-in. Each cue has a
// window round its beat: done within PERFECT of it is perfect, anywhere in
// the window good, not at all a miss. A zone already reached when its window
// opens counts as good.
import { ZONE_CUES, type CueKind, type Routine } from "./routines";

export type SessionMode = "learn" | "play";
export type Judgement = "perfect" | "good" | "miss";
export type SessionEvent = { kind: Judgement; index: number; at: number };

/** Play: each cue's window opens this early and closes this late (s); perfect within ±PERFECT. */
export const WINDOW = { early: 0.4, late: 0.5, perfect: 0.15 };
/** The count-in before the first bar (bars). */
export const COUNT_IN_BARS = 1;

const POINTS: Record<Judgement, number> = { perfect: 1, good: 0.6, miss: 0 };

/** Stars for a finished routine (1–3), from how well its cues were done. */
export const starsFor = (results: readonly (Judgement | null)[]) => {
  const count = results.length || 1;
  const score =
    results.reduce((sum, r) => sum + (r ? POINTS[r] : 0), 0) / count;
  if (score >= 0.8) return 3;
  if (score >= 0.5) return 2;
  return 1;
};

export class Session {
  readonly routine: Routine;

  readonly mode: SessionMode;

  /** The routine's first downbeat (after the count-in), and seconds per beat. */
  readonly t0: number;

  readonly spb: number;

  readonly results: (Judgement | null)[];

  /** Learn: the next cue. Play: the earliest cue not yet judged. */
  next = 0;

  done = false;

  /** Events not yet shown (the caller drains them). */
  events: SessionEvent[] = [];

  constructor(routine: Routine, mode: SessionMode, t0: number, spb: number) {
    this.routine = routine;
    this.mode = mode;
    this.t0 = t0;
    this.spb = spb;
    this.results = routine.cues.map(() => null);
  }

  /** A cue's time (Play). */
  timeOf(index: number) {
    return this.t0 + this.routine.cues[index].beat * this.spb;
  }

  /** Play: the routine's position (beats from its first bar; < 0 in the count-in). */
  beatAt(now: number) {
    return (now - this.t0) / this.spb;
  }

  /** The cue to do now (Learn: the next; Play: the earliest still open). */
  current(now: number) {
    if (this.mode === "learn") return this.next;
    for (let i = this.next; i < this.routine.cues.length; i += 1)
      if (this.results[i] === null && now <= this.timeOf(i) + WINDOW.late)
        return i;
    return this.routine.cues.length;
  }

  /** How far through (0..1). */
  progress(now: number) {
    if (this.mode === "learn") return this.next / this.routine.cues.length;
    return Math.min(1, Math.max(0, this.beatAt(now) / (this.routine.bars * 4)));
  }

  get stars() {
    return starsFor(this.results);
  }

  private count(index: number, result: Judgement, at: number) {
    this.results[index] = result;
    this.events.push({ kind: result, index, at });
  }

  /** You did something (at `at`). */
  action(kind: CueKind, at: number) {
    if (this.done) return;
    const { cues } = this.routine;
    if (this.mode === "learn") {
      if (cues[this.next]?.kind === kind) {
        this.count(this.next, "good", at);
        this.next += 1;
      }
      return;
    }
    // Play: the nearest open cue of this kind whose window holds `at`.
    let best = -1;
    let bestGap = Infinity;
    for (let i = this.next; i < cues.length; i += 1) {
      const gap = at - this.timeOf(i);
      if (
        this.results[i] === null &&
        cues[i].kind === kind &&
        gap >= -WINDOW.early &&
        gap <= WINDOW.late &&
        Math.abs(gap) < bestGap
      ) {
        best = i;
        bestGap = Math.abs(gap);
      }
    }
    if (best >= 0)
      this.count(best, bestGap <= WINDOW.perfect ? "perfect" : "good", at);
  }

  /** Moves on to `now`, with the crossfader and filter as they are. */
  update(now: number, xfade: number, filter: number) {
    if (this.done) return;
    const { cues } = this.routine;
    if (this.mode === "learn") {
      const c = cues[this.next];
      const zone = c && ZONE_CUES[c.kind];
      if (zone && zone(xfade, filter)) {
        this.count(this.next, "good", now);
        this.next += 1;
      }
      if (this.next >= cues.length) this.done = true;
      return;
    }
    for (let i = this.next; i < cues.length; i += 1) {
      const open = this.timeOf(i) - WINDOW.early;
      if (now < open) break;
      const zone = ZONE_CUES[cues[i].kind];
      if (this.results[i] === null && zone && zone(xfade, filter)) {
        const gap = Math.abs(now - this.timeOf(i));
        this.count(i, gap <= WINDOW.perfect ? "perfect" : "good", now);
      }
    }
    // Cues whose window has closed are judged.
    while (this.next < cues.length) {
      const i = this.next;
      if (this.results[i] === null) {
        if (now <= this.timeOf(i) + WINDOW.late) break;
        this.count(i, "miss", now);
      }
      this.next += 1;
    }
    const end = this.t0 + this.routine.bars * 4 * this.spb;
    if (
      this.next >= cues.length &&
      now >= Math.min(end, this.timeOf(cues.length - 1) + 1.5)
    )
      this.done = true;
  }
}
