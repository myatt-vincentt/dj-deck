// What the decks, the mixer, the ghost hands, the drags and keys and the
// page UI share. Per-frame values are read and written in the frame loop
// (never React state); the few the page UI shows bump a version it
// subscribes to.
//
// The beat: both loops start together at `transport.t0` and repeat every
// four bars. Its times are the audio clock's once the sound runs (before
// that, the page's own clock, so the records already turn behind the home
// page). A new style starts on the next bar; the pads land on the next beat.
import { useSyncExternalStore } from "react";

import { sound } from "./audio";
import { angleToMusic, DeckMotion } from "./deck";
import { VIEWS, type View } from "./layout";
import {
  barLength,
  beatLength,
  deckEnvelope,
  DECKS,
  STYLE,
  STYLES,
  type DeckId,
  type StyleId,
} from "./music";

export type Card = "style" | "fx" | null;
export type PadId = 1 | 2 | 3 | 4;
export const PADS: PadId[] = [1, 2, 3, 4];
/** What each pad does. */
export const PAD_LABEL: Record<PadId, string> = {
  1: "Fill",
  2: "Echo",
  3: "Riser",
  4: "Vocal chop",
};

const listeners = new Set<() => void>();
let version = 0;

const pageClock = () => performance.now() / 1000;

export const dj = {
  /** Screen width ÷ height. */
  aspect: 1,

  // The music.
  style: "house" as StyleId,
  playing: true,
  /** The crossfader: 0 all deck A … 0.5 both … 1 all deck B. */
  xfade: 0.5,
  /** The filter knob: -1 low-pass … 0 open … 1 high-pass. */
  filter: 0,
  transport: {
    /** When the loops started (s, on `clock`'s clock), and the tempo. */
    t0: 0,
    bpm: STYLE.house.bpm,
    /** The style sounding now (`dj.style` is the one chosen). */
    style: "house" as StyleId,
    /** A style waiting for the next bar. */
    next: null as { style: StyleId; at: number } | null,
    /** The times are the audio clock's (the sound runs). */
    audio: false,
  },
  /** The records you see. */
  decks: { A: new DeckMotion(), B: new DeckMotion() } as Record<
    DeckId,
    DeckMotion
  >,
  /** The deck your hand was on last (the ghost scratch hand goes there). */
  handDeck: "B" as DeckId,
  /** A drag's angle on a record (radians) while scratching, for the hand. */
  scratchAngle: { A: 0, B: 0 } as Record<DeckId, number>,

  // What the lights follow (each frame).
  levels: { A: 0, B: 0, low: 0, level: 0 },
  /** The beat: beats since the start (fraction included) as heard, or -1. */
  beat: -1,
  /** The pads and the drop (performance.now() / 1000 when they sound). */
  fx: {
    pads: { 1: -1e9, 2: -1e9, 3: -1e9, 4: -1e9 } as Record<PadId, number>,
    padLength: { 1: 1, 2: 1, 3: 1, 4: 0.4 } as Record<PadId, number>,
    pressed: { 1: -1e9, 2: -1e9, 3: -1e9, 4: -1e9 } as Record<PadId, number>,
    drop: { from: -1e9, land: -1e9 },
  },
  /** performance.now() / 1000 while music plays (the ON AIR sign). */
  playedAt: -1e9,

  // What the page UI shows.
  view: "front" as View,
  night: false,
  camHidden: false,
  loaded: false,
  started: false,
  entered: false,
  howTo: false,
  howToUntil: null as number | null,
  dockPulseAt: null as number | null,
  card: null as Card,
  changed() {
    version += 1;
    listeners.forEach((l) => l());
  },
};

DECKS.forEach((d) => {
  dj.decks[d].mode = "play";
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Re-renders the caller when the page UI's state changes. */
export const useDjVersion = () =>
  useSyncExternalStore(subscribe, () => version);

// ---------------------------------------------------------------- the clock

/** Now, on the transport's clock (the audio clock once the sound runs). */
const now = () =>
  dj.transport.audio ? (sound.now() ?? pageClock()) : pageClock();
/** Now as heard (the speakers lag the clock a little), for the scene. */
const heard = () =>
  dj.transport.audio ? (sound.now(true) ?? pageClock()) : pageClock();

/** The next beat (or bar) line at least `lead` seconds from now. */
export const nextLine = (t: number, every: number, lead = 0.03) => {
  const { t0 } = dj.transport;
  return t0 + Math.ceil((t + lead - t0) / every) * every;
};

// ---------------------------------------------------------------- the page UI

export const setView = (v: View) => {
  dj.view = v;
  dj.changed();
};
export const nextView = () =>
  setView(VIEWS[(VIEWS.indexOf(dj.view) + 1) % VIEWS.length]);

export const setNight = (on: boolean) => {
  dj.night = on;
  dj.changed();
};

export const setCard = (c: Card) => {
  dj.card = dj.card === c ? null : c;
  dj.changed();
};

export const toggleCam = () => {
  dj.camHidden = !dj.camHidden;
  dj.changed();
};

/** Start on the home page: the sound and the camera. */
export const start = () => {
  if (dj.started) return;
  void sound.unlock();
  dj.started = true;
  dj.changed();
};

/** The home page has faded: the steps card shows for a few seconds. */
export const INTRO_CARD_MS = 7000;
export const enter = () => {
  if (dj.entered) return;
  dj.entered = true;
  dj.howTo = true;
  dj.howToUntil = performance.now() + INTRO_CARD_MS;
  dj.changed();
};

/** The steps card closes. After the first one the dock pulses once. */
export const closeHowTo = () => {
  if (!dj.howTo) return;
  const first = dj.howToUntil !== null;
  dj.howTo = false;
  dj.howToUntil = null;
  if (first) dj.dockPulseAt = performance.now();
  dj.changed();
};

// ---------------------------------------------------------------- the music

/** The crossfader's gain for each deck: both full in the middle. */
export const crossfadeGains = (x: number) => ({
  A: x <= 0.5 ? 1 : Math.cos((x - 0.5) * Math.PI),
  B: x >= 0.5 ? 1 : Math.cos((0.5 - x) * Math.PI),
});

export const setCrossfade = (x: number) => {
  dj.xfade = Math.min(1, Math.max(0, x));
  const g = crossfadeGains(dj.xfade);
  sound.mix(g.A, g.B);
};

export const setFilter = (v: number) => {
  // A little dead zone in the middle, so "open" is easy to find.
  const c = Math.min(1, Math.max(-1, v));
  dj.filter = Math.abs(c) < 0.04 ? 0 : c;
  sound.filter(dj.filter);
};

export const setStyle = (id: StyleId) => {
  if (id === dj.style && !dj.transport.next) return;
  const t = dj.transport;
  if (dj.playing) {
    const at = nextLine(now(), barLength(t.bpm), 0.12);
    t.next = { style: id, at };
    sound.load(id, at);
  } else {
    t.next = null;
    t.style = id;
    t.bpm = STYLE[id].bpm;
    sound.load(id, now());
  }
  dj.style = id;
  dj.changed();
};
export const nextStyle = () =>
  setStyle(STYLES[(STYLES.indexOf(dj.style) + 1) % STYLES.length]);

export const setPlaying = (on: boolean) => {
  if (on === dj.playing) return;
  dj.playing = on;
  const t = dj.transport;
  if (on) {
    if (t.next) {
      t.style = t.next.style;
      t.bpm = STYLE[t.style].bpm;
      t.next = null;
    }
    t.t0 = now() + 0.06;
    sound.start(t.t0);
  } else sound.stop();
  DECKS.forEach((d) => {
    const m = dj.decks[d];
    if (m.mode === "play" || m.mode === "stopped")
      m.mode = on ? "play" : "stopped";
  });
  dj.changed();
};
export const togglePlay = () => setPlaying(!dj.playing);

// ---------------------------------------------------------------- the records

/** A hand (or the pointer) holds a record still: it brakes to a stop. */
export const holdDeck = (d: DeckId) => {
  dj.handDeck = d;
  if (!dj.playing) return;
  const m = dj.decks[d];
  if (m.mode === "brake" || m.mode === "scratch") return;
  m.mode = "brake";
  sound.brake(d);
};

/**
 * The record dragged round by `radians` (clockwise) since it was taken:
 * it follows the hand, and the sound scratches.
 */
const grab = { A: 0, B: 0 } as Record<DeckId, number>;
export const scratchDeck = (d: DeckId, radians: number) => {
  dj.handDeck = d;
  if (!dj.playing) return;
  const m = dj.decks[d];
  if (m.mode !== "scratch") {
    grab[d] = m.pos;
    m.mode = "scratch";
  }
  dj.scratchAngle[d] = radians;
  m.target = grab[d] + angleToMusic(radians);
  sound.scratch(d, m.target);
};

/** Let go: the record drops back onto the beat. */
export const releaseDeck = (d: DeckId) => {
  const m = dj.decks[d];
  dj.scratchAngle[d] = 0;
  if (m.mode !== "brake" && m.mode !== "scratch") return;
  m.mode = dj.playing ? "play" : "stopped";
  sound.release(d);
};

// ---------------------------------------------------------------- the pads

/** A pad (or its key): its effect lands on the next beat. */
export const pad = (k: PadId) => {
  const perf = pageClock();
  dj.fx.pressed[k] = perf;
  dj.changed();
  if (!dj.playing) return;
  const t = now();
  const { bpm } = dj.transport;
  const beat = beatLength(bpm);
  const tb = nextLine(t, beat);
  let at = tb;
  if (k === 1) {
    sound.fill(tb, bpm);
    dj.fx.padLength[1] = 2 * beat;
  } else if (k === 2) {
    sound.echo(tb, bpm);
    dj.fx.padLength[2] = 3 * beat;
  } else if (k === 3) {
    const land = nextLine(tb + 2 * beat, barLength(bpm), 0);
    sound.riser(tb, land);
    dj.fx.padLength[3] = land - tb;
  } else {
    at = nextLine(t, beat / 2);
    sound.chop(at, dj.style);
    dj.fx.padLength[4] = 0.4;
  }
  dj.fx.pads[k] = perf + (at - t);
};

/** The drop: the music thins and rises, then lands on a bar with a boom. */
export const drop = () => {
  if (!dj.playing) return;
  const perf = pageClock();
  // One at a time.
  if (perf < dj.fx.drop.land + 0.2) return;
  const t = now();
  const { bpm } = dj.transport;
  const beat = beatLength(bpm);
  const from = nextLine(t, beat);
  const land = nextLine(from + 3 * beat, barLength(bpm), 0);
  sound.drop(from, land, bpm);
  dj.fx.drop = { from: perf + (from - t), land: perf + (land - t) };
  dj.changed();
};

// ---------------------------------------------------------------- each frame

/**
 * Once a frame: the clock (and the sound once it runs), the records, and
 * what the lights follow.
 */
export const tick = (dt: number) => {
  const t = dj.transport;
  // The sound has just started: the loops start together, now.
  if (!t.audio && sound.ready) {
    t.audio = true;
    t.next = null;
    t.style = dj.style;
    t.bpm = STYLE[dj.style].bpm;
    const at = (sound.now() ?? 0) + 0.12;
    t.t0 = at;
    sound.load(dj.style, at);
    setCrossfade(dj.xfade);
    setFilter(dj.filter);
    if (dj.playing) sound.start(at);
    sound.prepareAll();
  }
  const h = heard();
  if (t.next && h >= t.next.at) {
    t.t0 = t.next.at;
    t.style = t.next.style;
    t.bpm = STYLE[t.style].bpm;
    t.next = null;
  }
  const slip = dj.playing ? h - t.t0 : null;
  const gains = crossfadeGains(dj.xfade);
  const sounding = t.style;
  let low = 0;
  let level = 0;
  DECKS.forEach((d) => {
    const m = dj.decks[d];
    m.step(dt, slip);
    const moving = Math.min(1, Math.abs(m.rate));
    const env = deckEnvelope(sounding, d, m.pos);
    const lv = env.level * moving * gains[d];
    dj.levels[d] = lv;
    low = Math.max(low, env.low * moving * gains[d]);
    level = Math.max(level, lv);
  });
  // The drop's build thins the low end; its landing hits hard.
  const perf = pageClock();
  const { from, land } = dj.fx.drop;
  if (perf >= from && perf < land) low *= 0.15;
  if (perf >= land && perf < land + 0.6) {
    const k = 1 - (perf - land) / 0.6;
    low = Math.max(low, k);
    level = Math.max(level, k);
  }
  // A low-pass filter keeps the low end; a high-pass takes it away.
  if (dj.filter > 0) low *= 1 - 0.85 * dj.filter;
  dj.levels.low = low;
  dj.levels.level = level;
  dj.beat = dj.playing ? (h - t.t0) / beatLength(t.bpm) : -1;
  if (level > 0.05) dj.playedAt = perf;
};
