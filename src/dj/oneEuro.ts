// Smoothing for a hand's reading (no scene).

/**
 * The one-euro filter: a low-pass whose cut-off rises with speed, so a still
 * hand is steady and a moving one follows without lag.
 */
export class OneEuro {
  private x: number | null = null;

  private dx = 0;

  private t = 0;

  constructor(
    /** The cut-off when still (Hz): above the tracker's slow wander, below its jitter. */
    readonly minCutoff = 3.5,
    /** How much speed raises it (per unit / s). */
    readonly beta = 1.2,
    /** The cut-off for the speed itself (Hz). */
    readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** A reading `v` at `t` (s); returns the smoothed value. */
  push(t: number, v: number) {
    if (this.x === null) {
      this.x = v;
      this.t = t;
      this.dx = 0;
      return v;
    }
    const dt = Math.max(1e-3, t - this.t);
    this.t = t;
    const dRaw = (v - this.x) / dt;
    this.dx += (dRaw - this.dx) * OneEuro.alpha(this.dCutoff, dt);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += (v - this.x) * OneEuro.alpha(cutoff, dt);
    return this.x;
  }

  reset() {
    this.x = null;
  }

  get value() {
    return this.x;
  }
}
