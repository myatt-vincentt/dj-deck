// How a turntable's record moves: plain code (no sound, no scene), shared by
// the scene (the record you see) and the sound (the record you hear, in
// audio.ts's player, which follows the same rules sample by sample).
//
//   play     the record turns with the beat: its place is the time since
//            the loop started
//   brake    held still: the record slows to a stop (and stays stopped)
//   scratch  dragged: the record follows your hand, forwards or back
//   stopped  the deck is off (it slows to a stop the same way)
//
// Letting go of a held or scratched record drops it back where the beat has
// got to meanwhile ("slip"), so the two decks never fall out of time.

export type DeckMode = "play" | "brake" | "scratch" | "stopped";

/** The brake: how quickly the record slows (time constant, s). */
export const BRAKE_TAU = 0.32;
/** The deck switched off slows a little faster (s). */
export const STOP_TAU = 0.2;
/** A scratched record catches up with your hand over about this long (s). */
export const SCRATCH_FOLLOW = 0.03;
/** …and its speed settles over this long (s): smooth, not jerky. */
export const SCRATCH_SMOOTH = 0.012;
/** A scratch is never faster than this (× normal speed). */
export const SCRATCH_MAX = 6;
/** A record turns at 33⅓ rpm: radians per second of music. */
export const SPIN = (2 * Math.PI * 100) / 3 / 60;

export class DeckMotion {
  /** Where the record is (seconds of music, not wrapped to the loop). */
  pos = 0;

  /** How fast it turns (× normal; negative is backwards). */
  rate = 0;

  mode: DeckMode = "stopped";

  /** Where your hand has dragged it to (seconds), while scratching. */
  target = 0;

  /** How far the record has turned in all (seconds; never jumps). */
  travel = 0;

  /**
   * One step of `dt` seconds. `slip` is where the beat is (seconds of music
   * since the loop started), or null when the decks are stopped; `speed`
   * the turntables' speed (× normal).
   */
  step(dt: number, slip: number | null, speed = 1) {
    if (this.mode === "play" && slip !== null) {
      const moved = slip - this.pos;
      this.pos = slip;
      this.rate = speed;
      // A jump back to the beat (after a scratch) doesn't spin the record.
      this.travel += Math.abs(moved) < 0.25 ? moved : dt * speed;
      return;
    }
    const before = this.pos;
    if (this.mode === "scratch") {
      const want = Math.max(
        -SCRATCH_MAX,
        Math.min(SCRATCH_MAX, (this.target - this.pos) / SCRATCH_FOLLOW),
      );
      this.rate += (want - this.rate) * (1 - Math.exp(-dt / SCRATCH_SMOOTH));
    } else {
      const tau = this.mode === "brake" ? BRAKE_TAU : STOP_TAU;
      this.rate *= Math.exp(-dt / tau);
      if (Math.abs(this.rate) < 1e-3) this.rate = 0;
    }
    this.pos += this.rate * dt;
    this.travel += this.pos - before;
  }

  /** The record's angle (radians; records turn clockwise seen from above). */
  get angle() {
    return -this.travel * SPIN;
  }
}

/** A drag's angle on the record (radians, clockwise) → seconds of music. */
export const angleToMusic = (radians: number) => radians / SPIN;
