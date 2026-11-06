// The music, made in code: four styles, each a loop of four bars on two
// decks. Deck A carries the music (chords, a lead line, light percussion),
// deck B the beat (drums and bass). Both loops are the same length, so they
// always play in time; the crossfader blends them.
//
// Everything here is plain code (no Web Audio): it writes the samples of a
// loop into arrays. A note that rings past the loop's end wraps round to its
// start, so the loop joins without a click. The same instruments also make
// the pads' one-shot sounds (the fill's drums, the crash, the drop's boom).

export type StyleId = "house" | "hiphop" | "disco" | "lofi";
export const STYLES: StyleId[] = ["house", "hiphop", "disco", "lofi"];
export type DeckId = "A" | "B";
export const DECKS: DeckId[] = ["A", "B"];

/** Bars in a loop, and sixteenth steps in a bar. */
export const BARS = 4;
export const STEPS = 16;

type ChordSound = "stab" | "strings" | "rhodes" | "piano";
type BassSound = "saw" | "octave" | "sub" | "round";
type LeadSound = "arp" | "pluck" | "bell" | "keys";

/**
 * A style. The drum lines are 16 steps a bar ("X" accent, "x" normal, "o"
 * soft, "." rest). The bass line: "r" the chord's root, "o" an octave up,
 * "f" its fifth, "-" holds, "." rests. The chord rhythm: "x" a hit, "-"
 * holds. The lead: "0"–"3" the chord's notes an octave up, "-" holds.
 */
export type Style = {
  label: string;
  bpm: number;
  /** How late the off sixteenths come (share of a step). */
  swing: number;
  /** Each bar's chord (MIDI, low to high) and the bass's root. */
  chords: number[][];
  roots: number[];
  kick: string;
  snare: string;
  clap: string;
  hat: string;
  open: string;
  shaker: string;
  bass: string;
  chordHits: string;
  lead: string;
  sound: {
    chords: ChordSound;
    bass: BassSound;
    lead: LeadSound;
    /** The music ducks under every kick (house). */
    pump: boolean;
    /** Record crackle under the music (lo-fi). */
    crackle: boolean;
    /** A softer, rounder kit (lo-fi, hip-hop). */
    soft: boolean;
  };
  /** The vocal chop's pitch (Hz), in the style's key. */
  voice: number;
  /** Deck colours' order on the LEDs (hue, 0..1) for the style's accent. */
  hue: number;
};

const AM7 = [57, 60, 64, 67];
const FMAJ7 = [53, 57, 60, 64];
const CMAJ7 = [55, 59, 60, 64];
const G6 = [55, 59, 62, 64];

export const STYLE: Record<StyleId, Style> = {
  house: {
    label: "House",
    bpm: 124,
    swing: 0,
    chords: [AM7, FMAJ7, CMAJ7, G6],
    roots: [33, 29, 36, 31],
    kick: "X...x...x...x...",
    snare: "................",
    clap: "....x.......x...",
    hat: "..x...x...x...x.",
    open: "..o...o...o...o.",
    shaker: "oxoxoxoxoxoxoxox",
    bass: "..r-..r-..o-..r-",
    chordHits: "..x..x....x..x..",
    lead: "0.1.2.1.3.2.1.2.",
    sound: {
      chords: "stab",
      bass: "saw",
      lead: "arp",
      pump: true,
      crackle: false,
      soft: false,
    },
    voice: 220,
    hue: 0.86,
  },
  hiphop: {
    label: "Hip-hop",
    bpm: 90,
    swing: 0.16,
    chords: [
      [53, 57, 60, 64],
      [53, 55, 59, 64],
      [52, 55, 59, 62],
      [55, 57, 61, 64],
    ],
    roots: [38, 31, 36, 33],
    kick: "X......x..x.....",
    snare: "....X.......X...",
    clap: "................",
    hat: "x.o.x.o.x.o.x.oo",
    open: "..............o.",
    shaker: "................",
    bass: "r------.f-r-----",
    chordHits: "x-----x---x-----",
    lead: "..3.......2.1...",
    sound: {
      chords: "rhodes",
      bass: "sub",
      lead: "bell",
      pump: false,
      crackle: false,
      soft: true,
    },
    voice: 196,
    hue: 0.08,
  },
  disco: {
    label: "Disco",
    bpm: 116,
    swing: 0,
    chords: [AM7, [54, 57, 60, 64], FMAJ7, [52, 56, 59, 62]],
    roots: [33, 38, 29, 28],
    kick: "X...x...x...x...",
    snare: "....x.......x...",
    clap: "................",
    hat: "oxoxoxoxoxoxoxox",
    open: "..x...x...x...x.",
    shaker: "................",
    bass: "r.o.r.o.r.o.r.o.",
    chordHits: "x---------------",
    lead: ".x.x.xx..x.x.xx.",
    sound: {
      chords: "strings",
      bass: "octave",
      lead: "pluck",
      pump: false,
      crackle: false,
      soft: false,
    },
    voice: 220,
    hue: 0.12,
  },
  lofi: {
    label: "Lo-fi",
    bpm: 80,
    swing: 0.2,
    chords: [
      [51, 55, 58, 62],
      [50, 53, 57, 60],
      [48, 51, 55, 58],
      [46, 50, 53, 57],
    ],
    roots: [39, 38, 36, 34],
    kick: "X......x.x......",
    snare: "....x.......x...",
    clap: "................",
    hat: "o.o.o.o.o.o.o.o.",
    open: "................",
    shaker: "................",
    bass: "r-----.r-r------",
    chordHits: "x-------x-------",
    lead: "....2-....1-3---",
    sound: {
      chords: "piano",
      bass: "round",
      lead: "keys",
      pump: false,
      crackle: true,
      soft: true,
    },
    voice: 175,
    hue: 0.55,
  },
};

/** Seconds per beat, per bar and per loop. */
export const beatLength = (bpm: number) => 60 / bpm;
export const barLength = (bpm: number) => 4 * beatLength(bpm);
export const loopLength = (bpm: number) => BARS * barLength(bpm);

export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** A step's strength from its letter (0: none). */
const STRENGTH: Record<string, number> = { X: 1, x: 0.8, o: 0.5 };
export const hitStrength = (c: string | undefined) =>
  (c !== undefined && STRENGTH[c]) || 0;

/** When step `s` (0..63 in the loop) sounds, in seconds from the loop's start. */
export const stepTime = (style: Style, s: number) => {
  const step = beatLength(style.bpm) / 4;
  return s * step + (s % 2 === 1 ? style.swing * step : 0);
};

// ---------------------------------------------------------------- the writer

/** A small repeatable random number source (so every render is the same). */
export const random = (seed: number) => {
  let s = Math.max(1, Math.floor(Math.abs(seed)) % 2147483646);
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647) * 2 - 1;
  };
};

export type Stereo = { left: Float32Array; right: Float32Array; rate: number };

const stereo = (length: number, rate: number): Stereo => ({
  left: new Float32Array(length),
  right: new Float32Array(length),
  rate,
});

/**
 * Adds a mono sound into a loop at `at` seconds, panned (-1 left … 1 right),
 * wrapping round past the end.
 */
const mixIn = (
  out: Stereo,
  sound: Float32Array,
  at: number,
  gain: number,
  pan = 0,
) => {
  const n = out.left.length;
  const start = Math.round(at * out.rate);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  /* eslint-disable no-param-reassign */
  for (let i = 0; i < sound.length; i += 1) {
    const k = (((start + i) % n) + n) % n;
    out.left[k] += sound[i] * gl;
    out.right[k] += sound[i] * gr;
  }
  /* eslint-enable no-param-reassign */
};

/** A state-variable filter (low-pass output), one sample at a time. */
const lowpass = () => {
  let low = 0;
  let band = 0;
  return (x: number, hz: number, rate: number, q = 0.7) => {
    const f = 2 * Math.sin((Math.PI * Math.min(hz, rate / 6.5)) / rate);
    low += f * band;
    const high = x - low - band / q;
    band += f * high;
    return low;
  };
};

// ---------------------------------------------------------------- the drums

/** The kick: a falling sine with a click (`soft`: rounder, longer). */
export const kick = (rate: number, soft = false, long = 1) => {
  const dur = (soft ? 0.5 : 0.42) * long;
  const out = new Float32Array(Math.round(dur * rate));
  const rnd = random(11);
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / rate;
    const f = (soft ? 44 : 48) + (soft ? 90 : 125) * Math.exp(-t * 30);
    phase += (2 * Math.PI * f) / rate;
    const env =
      Math.exp((-t * (soft ? 5.5 : 6.5)) / long) * Math.min(1, t / 0.0015);
    const click = t < 0.004 ? rnd() * (soft ? 0.15 : 0.5) * (1 - t / 0.004) : 0;
    out[i] = Math.tanh((Math.sin(phase) * env + click) * 1.6) * 0.95;
  }
  return out;
};

/** White noise, a little brighter (each sample less the one before). */
const brightNoise = (n: number, seed: number, times = 1) => {
  const rnd = random(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = rnd();
  for (let k = 0; k < times; k += 1)
    for (let i = n - 1; i > 0; i -= 1) out[i] = (out[i] - out[i - 1]) * 0.5;
  return out;
};

/** The snare: a short tone and a burst of noise (`soft`: a rim-like knock). */
export const snare = (rate: number, soft = false) => {
  const dur = soft ? 0.18 : 0.28;
  const n = Math.round(dur * rate);
  const noise = brightNoise(n, 23);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const body =
      Math.sin(2 * Math.PI * (soft ? 330 : 185) * t) *
      Math.exp(-t * (soft ? 40 : 22));
    const hiss =
      noise[i] * Math.exp(-t * (soft ? 30 : 14)) * (soft ? 0.9 : 1.6);
    out[i] = (body * 0.55 + hiss) * Math.min(1, t / 0.001);
  }
  return out;
};

/** The clap: three quick bursts and a short tail. */
export const clap = (rate: number) => {
  const n = Math.round(0.3 * rate);
  const noise = brightNoise(n, 37);
  const lp = lowpass();
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    let env = 0;
    for (let k = 0; k < 3; k += 1) {
      const tk = t - k * 0.011;
      if (tk >= 0) env += Math.exp(-tk * 180);
    }
    if (t > 0.022) env += 0.8 * Math.exp(-(t - 0.022) * 16);
    const x = noise[i] * 2.2;
    out[i] = (x - lp(x, 900, rate)) * env;
  }
  return out;
};

/** A hi-hat: bright noise, closed (short) or open (long). */
export const hat = (rate: number, open = false) => {
  const n = Math.round((open ? 0.42 : 0.07) * rate);
  const noise = brightNoise(n, open ? 47 : 41, 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    out[i] = noise[i] * 3 * Math.exp(-t * (open ? 8 : 55));
  }
  return out;
};

/** A shaker: soft bright noise, swelling in then out. */
export const shaker = (rate: number) => {
  const n = Math.round(0.09 * rate);
  const noise = brightNoise(n, 53, 1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    out[i] = noise[i] * Math.min(1, t / 0.012) * Math.exp(-t * 32);
  }
  return out;
};

/** A tom: a falling sine (the fill). */
export const tom = (rate: number, hz: number) => {
  const n = Math.round(0.35 * rate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    phase += (2 * Math.PI * hz * (1 + 0.5 * Math.exp(-t * 25))) / rate;
    out[i] = Math.sin(phase) * Math.exp(-t * 9) * Math.min(1, t / 0.001);
  }
  return out;
};

/** A crash cymbal: long bright noise. */
export const crash = (rate: number) => {
  const n = Math.round(2.4 * rate);
  const noise = brightNoise(n, 61, 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    out[i] = noise[i] * 2.4 * Math.exp(-t * 1.9) * Math.min(1, t / 0.002);
  }
  return out;
};

/** Plain white noise (the risers). */
export const whiteNoise = (rate: number, seconds: number) => {
  const rnd = random(71);
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i += 1) out[i] = rnd();
  return out;
};

// ---------------------------------------------------------------- the pitched parts

/** A note: its pitch (MIDI), start (s), length (s) and strength. */
type Note = { midi: number; at: number; len: number; vel: number };

const saw = (phase: number) => 2 * (phase - Math.floor(phase + 0.5));

/** A bass note. */
const bassNote = (rate: number, kind: BassSound, n: Note) => {
  const tail = 0.03;
  const len = Math.round((n.len + tail) * rate);
  const out = new Float32Array(len);
  const f = midiToHz(n.midi);
  const lp = lowpass();
  let p1 = 0;
  let p2 = 0.37;
  for (let i = 0; i < len; i += 1) {
    const t = i / rate;
    const off = t > n.len ? Math.max(0, 1 - (t - n.len) / tail) : 1;
    const on = Math.min(1, t / 0.004);
    let v = 0;
    if (kind === "saw" || kind === "octave") {
      p1 += f / rate;
      p2 += (f * 1.004) / rate;
      const cut =
        kind === "saw"
          ? 180 + 900 * Math.exp(-t * 12)
          : 300 + 1600 * Math.exp(-t * 16);
      v = lp((saw(p1) + saw(p2)) * 0.5, cut, rate, 1.3) * 1.5;
    } else if (kind === "sub") {
      p1 += f / rate;
      v =
        Math.tanh(
          (Math.sin(2 * Math.PI * p1) + 0.3 * Math.sin(4 * Math.PI * p1)) * 1.4,
        ) * Math.exp(-t * 0.9);
    } else {
      p1 += f / rate;
      v =
        (Math.sin(2 * Math.PI * p1) + 0.12 * Math.sin(6 * Math.PI * p1)) *
        Math.exp(-t * 0.6);
    }
    out[i] = v * on * off * n.vel;
  }
  return out;
};

/** A chord's note on the music deck (one channel: a little detuned per side). */
const chordNote = (
  rate: number,
  kind: ChordSound,
  n: Note,
  side: number,
  wob: (t: number) => number,
) => {
  const RELEASE: Record<ChordSound, number> = {
    strings: 0.3,
    stab: 0.08,
    rhodes: 0.5,
    piano: 0.5,
  };
  const release = RELEASE[kind];
  const len = Math.round((n.len + release) * rate);
  const out = new Float32Array(len);
  const f = midiToHz(n.midi) * (1 + side * 0.0025);
  const lp = lowpass();
  const ph = [0, 0.31, 0.62];
  let phase = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / rate;
    const off = t > n.len ? Math.max(0, 1 - (t - n.len) / release) : 1;
    let v = 0;
    if (kind === "stab") {
      for (let k = 0; k < 3; k += 1) {
        ph[k] += (f * (1 + (k - 1) * 0.004)) / rate;
        v += saw(ph[k]);
      }
      v = lp(v / 3, 500 + 2600 * Math.exp(-t * 10), rate, 1.1);
      v *= Math.exp(-t * 4) * Math.min(1, t / 0.002) * 1.4;
    } else if (kind === "strings") {
      const vib = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t + side);
      ph[0] += (f * vib) / rate;
      ph[1] += (f * vib * 1.005) / rate;
      v = lp((saw(ph[0]) + saw(ph[1])) * 0.5, 2300, rate, 0.8);
      v *= Math.min(1, t / 0.14);
    } else if (kind === "rhodes") {
      phase += f / rate;
      const index = 1.4 * Math.exp(-t * 3.5) + 0.25;
      v = Math.sin(2 * Math.PI * phase + index * Math.sin(2 * Math.PI * phase));
      v *= Math.exp(-t * 1.1) * Math.min(1, t / 0.003);
      v *= 1 + 0.25 * Math.sin(2 * Math.PI * 4.2 * t + side * 1.5);
    } else {
      // A dusty piano: decaying harmonics, slightly out of tune with the tape.
      phase += (f * wob(n.at + t)) / rate;
      for (let k = 1; k <= 6; k += 1)
        v +=
          (Math.sin(2 * Math.PI * k * phase * (1 + 0.0007 * k)) / k ** 1.5) *
          Math.exp(-t * (1.2 + 0.9 * k));
      v *= Math.min(1, t / 0.003) * 0.9;
    }
    out[i] = v * off * n.vel;
  }
  return out;
};

/** A lead note (mono). */
const leadNote = (rate: number, kind: LeadSound, n: Note, seed: number) => {
  if (kind === "pluck") {
    // A muted strum's string (a plucked string made in code).
    const len = Math.round(0.16 * rate);
    const out = new Float32Array(len);
    const period = Math.max(2, Math.round(rate / midiToHz(n.midi)));
    const ring = new Float32Array(period);
    const rnd = random(seed);
    for (let i = 0; i < period; i += 1) ring[i] = rnd();
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const k = i % period;
      const x = ring[k];
      const y = 0.5 * (x + last) * 0.985;
      last = x;
      ring[k] = y;
      out[i] = x * Math.exp((-i / rate) * 22) * n.vel;
    }
    return out;
  }
  const len = Math.round((n.len + 0.25) * rate);
  const out = new Float32Array(len);
  const f = midiToHz(n.midi);
  const lp = lowpass();
  let p = 0;
  for (let i = 0; i < len; i += 1) {
    const t = i / rate;
    const off = t > n.len ? Math.max(0, 1 - (t - n.len) / 0.25) : 1;
    let v = 0;
    if (kind === "arp") {
      p += f / rate;
      const sq = p - Math.floor(p) < 0.5 ? 1 : -1;
      v = lp(sq, 700 + 2400 * Math.exp(-t * 18), rate, 1.4);
      v *= Math.exp(-t * 9);
    } else if (kind === "bell") {
      p += f / rate;
      v =
        (Math.sin(2 * Math.PI * p) +
          0.35 * Math.sin(2 * Math.PI * 3.5 * p) * Math.exp(-t * 6)) *
        Math.exp(-t * 2.4);
    } else {
      p += (f * (1 + 0.004 * Math.sin(2 * Math.PI * 5 * t))) / rate;
      v =
        (Math.sin(2 * Math.PI * p) + 0.2 * Math.sin(4 * Math.PI * p)) *
        Math.exp(-t * 1.6);
    }
    out[i] = v * Math.min(1, t / 0.003) * off * n.vel;
  }
  return out;
};

/** The notes of a line ("r", "o", "f", digits; "-" holds, "." rests) over the loop. */
const lineNotes = (
  style: Style,
  line: string,
  pitch: (c: string, bar: number) => number | null,
  vel: number,
) => {
  const notes: Note[] = [];
  const end = BARS * STEPS;
  for (let s = 0; s < end; s += 1) {
    const c = line[s % STEPS];
    const midi =
      c === "." || c === "-" ? null : pitch(c, Math.floor(s / STEPS));
    if (midi !== null) {
      let e = s + 1;
      while (e < end && line[e % STEPS] === "-" && e % STEPS !== 0) e += 1;
      const at = stepTime(style, s);
      notes.push({ midi, at, len: stepTime(style, e) - at, vel });
    }
  }
  return notes;
};

// ---------------------------------------------------------------- the loops

/** Brings a loop's loudest sample to `peak`, rounding off the very top. */
const finish = (out: Stereo, peak: number) => {
  let m = 1e-6;
  for (let i = 0; i < out.left.length; i += 1)
    m = Math.max(m, Math.abs(out.left[i]), Math.abs(out.right[i]));
  const g = peak / m;
  /* eslint-disable no-param-reassign */
  for (let i = 0; i < out.left.length; i += 1) {
    out.left[i] = Math.tanh(out.left[i] * g * 1.1) / 1.1;
    out.right[i] = Math.tanh(out.right[i] * g * 1.1) / 1.1;
  }
  /* eslint-enable no-param-reassign */
  return out;
};

/** Deck B: the beat (drums and bass). */
const renderBeat = (style: Style, rate: number) => {
  const out = stereo(Math.round(loopLength(style.bpm) * rate), rate);
  const { soft } = style.sound;
  const sounds = {
    kick: kick(rate, soft),
    snare: snare(rate, soft),
    clap: clap(rate),
    hat: hat(rate),
    open: hat(rate, true),
    shaker: shaker(rate),
  };
  const end = BARS * STEPS;
  for (let s = 0; s < end; s += 1) {
    const i = s % STEPS;
    const at = stepTime(style, s);
    const k = hitStrength(style.kick[i]);
    if (k) mixIn(out, sounds.kick, at, k * 1.0);
    const sn = hitStrength(style.snare[i]);
    if (sn) mixIn(out, sounds.snare, at, sn * (soft ? 0.45 : 0.55), 0.05);
    const c = hitStrength(style.clap[i]);
    if (c) mixIn(out, sounds.clap, at, c * 0.6, -0.05);
    const h = hitStrength(style.hat[i]);
    if (h) mixIn(out, sounds.hat, at, h * (soft ? 0.18 : 0.24), 0.3);
    const o = hitStrength(style.open[i]);
    if (o) mixIn(out, sounds.open, at, o * 0.2, 0.25);
    const sh = hitStrength(style.shaker[i]);
    if (sh) mixIn(out, sounds.shaker, at, sh * 0.18, -0.35);
  }
  // A last-bar snare pickup so the loop turns round.
  if (!soft) {
    mixIn(out, sounds.snare, stepTime(style, end - 2), 0.22, 0.1);
    mixIn(out, sounds.snare, stepTime(style, end - 1), 0.32, 0.1);
  }
  const bass = lineNotes(
    style,
    style.bass,
    (c, bar) => {
      const r = style.roots[bar];
      if (c === "r") return r;
      if (c === "o") return r + 12;
      if (c === "f") return r + 7;
      return null;
    },
    0.7,
  );
  bass.forEach((n) =>
    mixIn(out, bassNote(rate, style.sound.bass, n), n.at, 0.55),
  );
  return finish(out, 0.72);
};

/** Deck A: the music (chords, a lead line, a little percussion). */
const renderMusic = (style: Style, rate: number) => {
  const n = Math.round(loopLength(style.bpm) * rate);
  const out = stereo(n, rate);
  const wob = (t: number) => 1 + 0.0035 * Math.sin(2 * Math.PI * 0.55 * t);
  const chords = lineNotes(style, style.chordHits, () => 0, 0.5);
  chords.forEach((hit) => {
    const bar = Math.floor(hit.at / barLength(style.bpm) + 1e-6);
    style.chords[bar].forEach((midi, k) => {
      const note = { ...hit, midi, at: hit.at + k * 0.004 };
      const l = chordNote(rate, style.sound.chords, note, -1, wob);
      const r = chordNote(rate, style.sound.chords, note, 1, wob);
      const at = Math.round(note.at * rate);
      for (let i = 0; i < l.length; i += 1) {
        const j = (at + i) % n;
        out.left[j] += l[i] * 0.32;
        out.right[j] += r[i] * 0.32;
      }
    });
  });
  const kind = style.sound.lead;
  if (kind === "pluck") {
    // A muted strum of the chord's top notes on each hit.
    const end = BARS * STEPS;
    for (let s = 0; s < end; s += 1) {
      if (style.lead[s % STEPS] === "x") {
        const bar = Math.floor(s / STEPS);
        const at = stepTime(style, s);
        style.chords[bar].slice(1).forEach((midi, k) => {
          const note = { midi: midi + 12, at, len: 0.1, vel: 0.5 };
          mixIn(
            out,
            leadNote(rate, kind, note, s * 7 + k),
            at + k * 0.006,
            0.5,
            0.35,
          );
        });
      }
    }
  } else {
    const lead = lineNotes(
      style,
      style.lead,
      (c, bar) => {
        const d = Number(c);
        if (Number.isNaN(d)) return null;
        return style.chords[bar][d % 4] + 12;
      },
      0.45,
    );
    lead.forEach((note, k) =>
      mixIn(
        out,
        leadNote(rate, kind, note, k),
        note.at,
        kind === "arp" ? 0.22 : 0.3,
        k % 2 ? 0.3 : -0.3,
      ),
    );
  }
  // The house shaker lives with the music deck too (so it alone still moves).
  if (style.sound.pump) {
    const sh = shaker(rate);
    for (let s = 0; s < BARS * STEPS; s += 2)
      mixIn(out, sh, stepTime(style, s + 1), 0.08, 0.4);
  }
  if (style.sound.pump) {
    // The music ducks under every beat's kick.
    const beat = beatLength(style.bpm);
    for (let i = 0; i < n; i += 1) {
      const tb = (i / rate) % beat;
      const g = 1 - 0.55 * Math.exp(-tb * 9);
      out.left[i] *= g;
      out.right[i] *= g;
    }
  }
  if (style.sound.crackle) {
    // Record crackle and a soft hiss.
    const rnd = random(97);
    let pop = 0;
    let hiss = 0;
    for (let i = 0; i < n; i += 1) {
      if (rnd() > 0.9993) pop += rnd() * 0.25;
      pop *= 0.82;
      hiss += (rnd() * 0.02 - hiss) * 0.2;
      out.left[i] += pop + hiss;
      out.right[i] += pop * 0.8 + hiss;
    }
  }
  return finish(out, 0.62);
};

/** One deck's loop for a style. */
export const renderDeck = (id: StyleId, deck: DeckId, rate: number) =>
  deck === "A" ? renderMusic(STYLE[id], rate) : renderBeat(STYLE[id], rate);

// ---------------------------------------------------------------- what the lights follow

/**
 * How loud each deck is at a point in its loop (0..1), and its low end (the
 * kick), worked out from the patterns: the lights and meters pulse with it
 * even before the sound has started.
 */
export const deckEnvelope = (id: StyleId, deck: DeckId, at: number) => {
  const style = STYLE[id];
  const len = loopLength(style.bpm);
  const t = ((at % len) + len) % len;
  const step = beatLength(style.bpm) / 4;
  let s = Math.floor(t / step);
  // The latest kick (and snare / chord hit) at or before t.
  let kickEnv = 0;
  let hitEnv = 0;
  for (let back = 0; back < 8; back += 1, s -= 1) {
    const i = ((s % STEPS) + STEPS) % STEPS;
    const total = BARS * STEPS;
    const since =
      s < 0 ? t - (stepTime(style, s + total) - len) : t - stepTime(style, s);
    if (since < 0) {
      // Not yet (a late off-beat): look further back.
    } else if (deck === "B") {
      const k = hitStrength(style.kick[i]);
      if (k && kickEnv === 0) kickEnv = k * Math.exp(-since * 9);
      const sn = Math.max(
        hitStrength(style.snare[i]),
        hitStrength(style.clap[i]),
      );
      if (sn && hitEnv === 0) hitEnv = sn * Math.exp(-since * 10);
    } else {
      const c = style.chordHits[i] === "x" ? 1 : 0;
      if (c && hitEnv === 0) hitEnv = Math.exp(-since * 3);
      const l = style.lead[i];
      if (l !== "." && l !== "-" && kickEnv === 0)
        kickEnv = 0.6 * Math.exp(-since * 12);
    }
  }
  if (deck === "B")
    return {
      level: Math.min(1, 0.35 + 0.5 * kickEnv + 0.25 * hitEnv),
      low: kickEnv,
    };
  return { level: Math.min(1, 0.4 + 0.35 * hitEnv + 0.2 * kickEnv), low: 0 };
};
