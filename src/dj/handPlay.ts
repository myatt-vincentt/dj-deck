// Playing the decks with your hands, read from where your palms are on the
// camera picture (as you see it: a mirrored selfie, your right hand on the
// right) and the signs they make. Plain code (no scene).
//
//   deck hand (right)   an open palm moved quickly side to side scratches
//                       deck B: the record follows the hand (towards your
//                       right pulls it back, like a hand on the near edge of
//                       a record). A still hand lets it play; once the hand
//                       has stopped, the record drops back on the beat. A
//                       fist brakes it to a stop; opening the hand lets go.
//   mixer hand (left)   across the picture is the crossfader (towards your
//                       left is deck A, on your left), up the picture the
//                       filter: a middle band is open, higher is high-pass,
//                       lower low-pass. It takes over only once it has been
//                       in view for a moment, and glides there; a lost mixer
//                       hand lets both glide back to the middle.
//   signs (either hand) 1, 2, 3 or 4 fingers held still for a moment fire
//                       pad 1 … 4 once (show another sign, or lower the hand,
//                       to fire again)
//   drop                both open palms raised high and held, then pulled
//                       down fast together
/* eslint-disable max-classes-per-file -- the player and its two small helpers belong together */
import { OneEuro } from "./oneEuro";
import type { Sign } from "./signs";
import type { PadId } from "./state";

/** A palm on the picture: 0..1 across from the left, 0..1 down from the top. */
export type Palm = { x: number; y: number };

export type HandIn = {
  palm: Palm;
  /** The sign that counts (held a moment), and what the hand shows right now. */
  sign: Sign | null;
  raw: Sign | null;
};

export type HandsIn = {
  /** Seconds. */
  t: number;
  deck: HandIn | null;
  mixer: HandIn | null;
};

export type HandsOut = {
  /** The scratch's turn (radians, clockwise) since it began, or null. */
  scratch: number | null;
  /** The deck hand makes a fist: the record brakes. */
  brake: boolean;
  /** Pads fired by a sign this reading. */
  pads: PadId[];
  /** The drop fired this reading. */
  drop: boolean;
  /** The crossfader and filter the mixer hand asks for (null: it has no say). */
  xfade: number | null;
  filter: number | null;
  /** The mixer hand has taken over (in view long enough). */
  engaged: boolean;
  /** Both palms are up for the drop (it fires when they come down). */
  dropArmed: boolean;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * The scratch: how fast the palm must move across (picture widths / s) to
 * start one, how long it may be still before the record drops back (s), and
 * how far the record turns per picture width (radians).
 */
export const SCRATCH = { start: 0.45, still: 0.2, gain: 5 };
/** A sign fires its pad once the hand has moved slower than `speed` (picture / s) for `time` s. */
export const SIGN_STILL = { speed: 0.3, time: 0.2 };
/** The same pad from the same hand waits this long before it can fire again (s): a flicker of another sign doesn't refire it. */
export const SIGN_AGAIN = 1.2;
/** The signs that fire pads. */
export const PAD_SIGNS: Partial<Record<Sign, PadId>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};
/**
 * The mixer hand: across, the crossfader's zone (A at `left`, B at `right`,
 * a dead zone of `dead` around the middle); up, the filter's (high-pass full
 * at `high`, open between `open`, low-pass full at `low`).
 */
export const MIXER_ZONE = {
  left: 0.08,
  right: 0.58,
  dead: 0.04,
  high: 0.2,
  open: [0.48, 0.72] as const,
  low: 0.95,
};
/**
 * The mixer hand takes over after `grab` s in view, gliding in over `glide`
 * s; it then follows with `follow` s of smoothing. Lost for `grace` s, the
 * crossfader and filter glide back to the middle over about `back` s.
 */
export const MIXER = {
  grab: 0.3,
  glide: 0.35,
  follow: 0.08,
  grace: 0.4,
  back: 0.8,
};
/**
 * The drop: both palms above `high` (share of the picture from the top) for
 * `hold` s arm it; then both moving down faster than `speed` (picture / s)
 * and `fall` lower than their highest, within `window` s, fire it. Then a
 * rest of `rest` s.
 */
export const DROP = {
  high: 0.3,
  hold: 0.3,
  speed: 1.0,
  fall: 0.28,
  window: 0.9,
  rest: 2,
};

const OPENISH = new Set<Sign | null>(["open", "four"]);

/** A palm's place and speed, smoothed. */
class Track {
  readonly fx = new OneEuro(2.5, 3);

  readonly fy = new OneEuro(2.5, 3);

  x = 0;

  y = 0;

  vx = 0;

  vy = 0;

  private t: number | null = null;

  push(t: number, p: Palm) {
    const x = this.fx.push(t, p.x);
    const y = this.fy.push(t, p.y);
    if (this.t !== null) {
      const dt = Math.max(1e-3, t - this.t);
      const k = 1 - Math.exp(-dt / 0.05);
      this.vx += ((x - this.x) / dt - this.vx) * k;
      this.vy += ((y - this.y) / dt - this.vy) * k;
    }
    this.x = x;
    this.y = y;
    this.t = t;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
    this.t = null;
    this.vx = 0;
    this.vy = 0;
  }
}

/** Fires a hand's pad once per held sign. */
class SignPads {
  private armed = true;

  private last: Sign | null = null;

  private stillSince: number | null = null;

  private fired = { pad: 0, at: -1e9 };

  push(
    t: number,
    h: HandIn | null,
    speed: number,
    allowed: boolean,
  ): PadId | null {
    if (!h || speed >= SIGN_STILL.speed) this.stillSince = null;
    else if (this.stillSince === null) this.stillSince = t;
    const still =
      this.stillSince !== null && t - this.stillSince >= SIGN_STILL.time;
    const sign = h?.sign ?? null;
    if (sign !== this.last) {
      this.last = sign;
      this.armed = true;
    }
    const pad = sign ? PAD_SIGNS[sign] : undefined;
    if (!pad || !this.armed || !still || !allowed) return null;
    this.armed = false;
    if (pad === this.fired.pad && t - this.fired.at < SIGN_AGAIN) return null;
    this.fired = { pad, at: t };
    return pad;
  }
}

export class HandDj {
  private deck = new Track();

  private mixer = new Track();

  private deckSeen = false;

  private mixerSeen = false;

  // The scratch.
  private scratching = false;

  private x0 = 0;

  private movedAt = -1e9;

  // The mixer.
  private mixerSince: number | null = null;

  private mixerLostAt: number | null = null;

  private owned = false;

  private xf = 0.5;

  private fl = 0;

  private lastT: number | null = null;

  private holdOff = -1e9;

  // The signs.
  private deckPads = new SignPads();

  private mixerPads = new SignPads();

  // The drop.
  private highSince: number | null = null;

  private armedUntil = -1e9;

  private top = { deck: 1, mixer: 1 };

  private droppedAt = -1e9;

  /** Where the mixer hand's crossfader and filter start from (the current ones). */
  setMixer(xfade: number, filter: number) {
    if (this.owned) return;
    this.xf = xfade;
    this.fl = filter;
  }

  update(i: HandsIn): HandsOut {
    const { t } = i;
    const dt = this.lastT === null ? 0 : clamp(t - this.lastT, 0, 0.2);
    this.lastT = t;
    const out: HandsOut = {
      scratch: null,
      brake: false,
      pads: [],
      drop: false,
      xfade: null,
      filter: null,
      engaged: false,
      dropArmed: false,
    };

    // Each palm, smoothed.
    if (i.deck) this.deck.push(t, i.deck.palm);
    else if (this.deckSeen) this.deck.reset();
    this.deckSeen = !!i.deck;
    if (i.mixer) this.mixer.push(t, i.mixer.palm);
    else if (this.mixerSeen) this.mixer.reset();
    this.mixerSeen = !!i.mixer;

    // The drop: both open palms up high, held, then down fast together.
    const bothOpen =
      !!i.deck &&
      !!i.mixer &&
      OPENISH.has(i.deck.raw) &&
      OPENISH.has(i.mixer.raw);
    const bothHigh =
      bothOpen && this.deck.y < DROP.high && this.mixer.y < DROP.high;
    if (bothHigh) {
      if (this.highSince === null) this.highSince = t;
      this.top.deck = Math.min(this.top.deck, this.deck.y);
      this.top.mixer = Math.min(this.mixer.y, this.top.mixer);
      if (t - this.highSince >= DROP.hold) this.armedUntil = t + DROP.window;
    } else {
      this.highSince = null;
    }
    const armed = t <= this.armedUntil && !!i.deck && !!i.mixer;
    if (!armed && !bothHigh) this.top = { deck: 1, mixer: 1 };
    out.dropArmed = armed;
    if (
      armed &&
      t - this.droppedAt > DROP.rest &&
      this.deck.vy > DROP.speed &&
      this.mixer.vy > DROP.speed &&
      this.deck.y - this.top.deck > DROP.fall &&
      this.mixer.y - this.top.mixer > DROP.fall
    ) {
      out.drop = true;
      this.droppedAt = t;
      this.armedUntil = -1e9;
      this.top = { deck: 1, mixer: 1 };
      // The mixer hand lets go after a drop (it came down with it).
      this.holdOff = t + 1;
      this.mixerSince = null;
    }
    const busyDrop = bothHigh || armed || t - this.droppedAt < 0.6;

    // The deck hand: a fist brakes; an open palm moving fast scratches.
    if (i.deck) {
      out.brake = i.deck.sign === "fist";
      const fast = Math.abs(this.deck.vx) > SCRATCH.start;
      if (fast) this.movedAt = t;
      const canScratch = !out.brake && OPENISH.has(i.deck.raw) && !busyDrop;
      if (!this.scratching && fast && canScratch) {
        this.scratching = true;
        this.x0 = this.deck.x;
      }
      if (this.scratching && (!canScratch || t - this.movedAt > SCRATCH.still))
        this.scratching = false;
    } else this.scratching = false;
    if (this.scratching) out.scratch = -(this.deck.x - this.x0) * SCRATCH.gain;

    // The signs: a still hand fires its pad once.
    const deckPad = this.deckPads.push(
      t,
      i.deck,
      this.deck.speed,
      !this.scratching && !busyDrop,
    );
    if (deckPad) out.pads.push(deckPad);
    const mixerPad = this.mixerPads.push(
      t,
      i.mixer,
      this.mixer.speed,
      !busyDrop,
    );
    if (mixerPad && mixerPad !== deckPad) out.pads.push(mixerPad);

    // The mixer hand.
    if (i.mixer && t >= this.holdOff) {
      if (this.mixerSince === null) this.mixerSince = t;
      this.mixerLostAt = null;
      const held = t - this.mixerSince;
      if (held >= MIXER.grab) {
        out.engaged = true;
        this.owned = true;
        const z = MIXER_ZONE;
        let x = (this.mixer.x - z.left) / (z.right - z.left);
        x = clamp(x, 0, 1);
        if (Math.abs(x - 0.5) < z.dead) x = 0.5;
        const { y } = this.mixer;
        let f = 0;
        if (y < z.open[0])
          f = clamp((z.open[0] - y) / (z.open[0] - z.high), 0, 1);
        else if (y > z.open[1])
          f = -clamp((y - z.open[1]) / (z.low - z.open[1]), 0, 1);
        const tau =
          held - MIXER.grab < MIXER.glide ? MIXER.glide : MIXER.follow;
        const k = dt > 0 ? 1 - Math.exp(-dt / tau) : 0;
        this.xf += (x - this.xf) * k;
        this.fl += (f - this.fl) * k;
      }
    } else {
      this.mixerSince = null;
      if (this.owned) {
        if (this.mixerLostAt === null) this.mixerLostAt = t;
        // After a drop the filter opens at once; else after a moment.
        const back = t - this.mixerLostAt > MIXER.grace || t < this.holdOff;
        if (back) {
          const k = dt > 0 ? 1 - Math.exp(-dt / (MIXER.back / 3)) : 0;
          this.xf += (0.5 - this.xf) * k;
          this.fl += (0 - this.fl) * k;
          if (Math.abs(this.xf - 0.5) < 0.005 && Math.abs(this.fl) < 0.005) {
            this.xf = 0.5;
            this.fl = 0;
            this.owned = false;
            out.xfade = 0.5;
            out.filter = 0;
          }
        }
      }
    }
    if (this.owned) {
      out.xfade = this.xf;
      out.filter = this.fl;
    }
    return out;
  }
}
