// The sound: two decks and a mixer, all in Web Audio, all made in code.
//
//   deck A ┐                                       ┌→ echo (pad 2) ┐
//          ├→ crossfader → filter → drop sweep ────┤               ├→ limiter → speakers
//   deck B ┘   (pads: fill, riser, vocal chop) ───┘└──────────────→┘
//
// Each deck is a small player on the audio thread that plays its loop (from
// music.ts) at any speed, forwards or backwards: the record you scratch is
// the music you hear. It follows the same rules as the record you see
// (deck.ts). Everything is timed on the audio clock, so the decks stay
// locked together whatever the frame rate. Silent until Start (browsers
// only start sound on a tap).
import {
  BRAKE_TAU,
  SCRATCH_FOLLOW,
  SCRATCH_MAX,
  SCRATCH_SMOOTH,
  STOP_TAU,
} from "./deck";
import {
  beatLength,
  clap,
  crash,
  DECKS,
  kick,
  renderDeck,
  snare,
  STYLE,
  STYLES,
  tom,
  whiteNoise,
  type DeckId,
  type Stereo,
  type StyleId,
} from "./music";

const MASTER = 0.8;
/** The filter knob's range: low-pass down to, high-pass up to (Hz). */
export const FILTER = { lowest: 220, highest: 2600, q: 1.1 };
/** The echo: its time (beats), how much comes back, how much of a beat goes in. */
const ECHO = { beats: 0.75, feedback: 0.55, send: 0.9 };
/** The drop's build: its sweep's top (Hz). */
const DROP = { sweepTo: 1400 };

/** The deck player (runs on the audio thread; same rules as deck.ts). */
const PLAYER = `
const BRAKE_TAU = ${BRAKE_TAU}, STOP_TAU = ${STOP_TAU};
const FOLLOW = ${SCRATCH_FOLLOW}, SMOOTH = ${SCRATCH_SMOOTH}, MAX = ${SCRATCH_MAX};
const XFADE = 256;
class DeckPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null; this.R = null; this.len = 0; this.next = null;
    this.origin = null; this.startAt = null; this.speed = 1; this.startSpeed = 1;
    this.mode = "stopped"; this.pos = 0; this.rate = 0; this.target = 0;
    this.oldPos = 0; this.oldRate = 0; this.fade = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "load") this.next = m;
      else if (m.type === "start") { this.startAt = m.at; this.startSpeed = m.speed; }
      else if (m.type === "stop") { this.origin = null; this.startAt = null; if (this.mode !== "stopped") this.mode = "stopped"; }
      else if (m.type === "brake") { if (this.origin !== null && this.mode !== "brake") { this.mode = "brake"; } }
      else if (m.type === "scratch") { if (this.origin !== null) { if (this.mode !== "scratch") this.target = this.pos / sampleRate; this.mode = "scratch"; this.target = m.target; } }
      else if (m.type === "release") {
        if (this.origin !== null && this.mode !== "play") {
          this.oldPos = this.pos; this.oldRate = this.rate; this.fade = XFADE; this.mode = "play";
        }
      }
    };
  }
  read(p, ch) {
    const b = ch === 0 ? this.L : this.R;
    if (!b || !this.len) return 0;
    let x = p % this.len; if (x < 0) x += this.len;
    const i = Math.floor(x); const f = x - i;
    const j = i + 1 >= this.len ? 0 : i + 1;
    return b[i] + (b[j] - b[i]) * f;
  }
  process(_in, outputs) {
    const out = outputs[0];
    const l = out[0], r = out[1] || out[0];
    const sr = sampleRate;
    const kBrake = Math.exp(-1 / (BRAKE_TAU * sr)), kStop = Math.exp(-1 / (STOP_TAU * sr));
    const kSmooth = 1 - Math.exp(-1 / (SMOOTH * sr));
    for (let i = 0; i < l.length; i++) {
      const t = currentTime + i / sr;
      if (this.next && t >= this.next.at) {
        this.L = this.next.left; this.R = this.next.right; this.len = this.L.length;
        this.speed = this.next.speed;
        if (this.origin !== null) { this.origin = this.next.at; this.mode = "play"; this.fade = 0; }
        this.next = null;
      }
      if (this.startAt !== null && t >= this.startAt) {
        this.origin = this.startAt; this.speed = this.startSpeed; this.startAt = null; this.mode = "play"; this.fade = 0;
      }
      let amp = 1;
      if (this.mode === "play" && this.origin !== null) {
        this.pos = (t - this.origin) * sr * this.speed; this.rate = this.speed;
      } else if (this.mode === "scratch") {
        let want = (this.target * sr - this.pos) / (FOLLOW * sr);
        want = Math.max(-MAX, Math.min(MAX, want));
        this.rate += (want - this.rate) * kSmooth;
        this.pos += this.rate;
        amp = Math.min(1, Math.abs(this.rate) / 0.12);
      } else {
        this.rate *= this.mode === "brake" ? kBrake : kStop;
        if (Math.abs(this.rate) < 1e-4) this.rate = 0;
        this.pos += this.rate;
        amp = Math.min(1, Math.abs(this.rate) / 0.12);
      }
      let L = this.read(this.pos, 0) * amp, R = this.read(this.pos, 1) * amp;
      if (this.fade > 0) {
        const k = this.fade / XFADE;
        this.oldPos += this.oldRate;
        const a = Math.min(1, Math.abs(this.oldRate) / 0.12) * k;
        L = L * (1 - k) + this.read(this.oldPos, 0) * a;
        R = R * (1 - k) + this.read(this.oldPos, 1) * a;
        this.fade--;
      }
      l[i] = L; if (r !== l) r[i] = R;
    }
    return true;
  }
}
registerProcessor("dj-deck-player", DeckPlayer);
`;

type Graph = {
  ctx: AudioContext;
  decks: Record<DeckId, AudioWorkletNode>;
  gains: Record<DeckId, GainNode>;
  low: BiquadFilterNode;
  high: BiquadFilterNode;
  sweep: BiquadFilterNode;
  echoSend: GainNode;
  delay: DelayNode;
  fx: GainNode;
  master: GainNode;
  analyser: AnalyserNode;
  shots: Record<
    "snare" | "tomHi" | "tomLo" | "crash" | "boom" | "clap" | "noise",
    AudioBuffer
  >;
};

let ctx: AudioContext | null = null;
let graph: Graph | null = null;
let building: Promise<void> | null = null;
let unlocked = false;
/** Loops already made, by style and deck (at the context's sample rate). */
const loops = new Map<string, Stereo>();
/** Where the audio clock was last seen to move (for a smooth clock between frames). */
const clock = { ct: -1, perf: 0 };

const makeContext = () => {
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  return new AC({ latencyHint: "interactive" });
};

const loopOf = (style: StyleId, deck: DeckId, rate: number) => {
  const key = `${style}-${deck}-${rate}`;
  let l = loops.get(key);
  if (!l) {
    l = renderDeck(style, deck, rate);
    loops.set(key, l);
  }
  return l;
};

const toBuffer = (c: AudioContext, data: Float32Array) => {
  const b = c.createBuffer(1, data.length, c.sampleRate);
  b.getChannelData(0).set(data);
  return b;
};

const buildGraph = async (c: AudioContext) => {
  const url = URL.createObjectURL(
    new Blob([PLAYER], { type: "application/javascript" }),
  );
  await c.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const deckNode = () =>
    new AudioWorkletNode(c, "dj-deck-player", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  const decks = { A: deckNode(), B: deckNode() };
  const gains = { A: c.createGain(), B: c.createGain() };
  const sum = c.createGain();
  const fx = c.createGain();
  const low = c.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 20000;
  low.Q.value = FILTER.q;
  const high = c.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 20;
  high.Q.value = FILTER.q;
  const sweep = c.createBiquadFilter();
  sweep.type = "highpass";
  sweep.frequency.value = 20;
  sweep.Q.value = 2;
  const master = c.createGain();
  master.gain.value = MASTER;
  DECKS.forEach((d) => decks[d].connect(gains[d]).connect(sum));
  fx.connect(sum);
  sum.connect(low).connect(high).connect(sweep).connect(master);
  // The echo: a beat-timed delay that rings on after its beat.
  const echoSend = c.createGain();
  echoSend.gain.value = 0;
  const delay = c.createDelay(4);
  const feedback = c.createGain();
  feedback.gain.value = ECHO.feedback;
  const tone = c.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  sweep.connect(echoSend).connect(delay);
  delay.connect(tone).connect(feedback).connect(delay);
  tone.connect(master);
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const analyser = c.createAnalyser();
  analyser.fftSize = 1024;
  master.connect(limiter).connect(analyser).connect(c.destination);
  const rate = c.sampleRate;
  graph = {
    ctx: c,
    decks,
    gains,
    low,
    high,
    sweep,
    echoSend,
    delay,
    fx,
    master,
    analyser,
    shots: {
      snare: toBuffer(c, snare(rate)),
      clap: toBuffer(c, clap(rate)),
      tomHi: toBuffer(c, tom(rate, 150)),
      tomLo: toBuffer(c, tom(rate, 100)),
      crash: toBuffer(c, crash(rate)),
      boom: toBuffer(c, kick(rate, true, 3)),
      noise: toBuffer(c, whiteNoise(rate, 6)),
    },
  };
};

/** Plays a one-shot at `at` (audio time) into the mix (or straight out). */
const shot = (
  name: keyof Graph["shots"],
  at: number,
  gain: number,
  direct = false,
) => {
  if (!graph) return;
  const c = graph.ctx;
  const s = c.createBufferSource();
  s.buffer = graph.shots[name];
  const g = c.createGain();
  g.gain.value = gain;
  s.connect(g).connect(direct ? graph.master : graph.fx);
  s.start(Math.max(at, c.currentTime));
};

/** A rising noise sweep from `from` to `to` (audio time). */
const riser = (from: number, to: number, gain: number) => {
  if (!graph) return;
  const c = graph.ctx;
  const s = c.createBufferSource();
  s.buffer = graph.shots.noise;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 2.2;
  bp.frequency.setValueAtTime(350, from);
  bp.frequency.exponentialRampToValueAtTime(9000, to);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, from);
  g.gain.exponentialRampToValueAtTime(gain, to - 0.02);
  g.gain.linearRampToValueAtTime(0, to + 0.01);
  s.connect(bp).connect(g).connect(graph.fx);
  s.start(from);
  s.stop(to + 0.05);
};

/** The vocal chop: a sung "hey" made in code (a buzz through vowel resonances). */
const hey = (at: number, hz: number) => {
  if (!graph) return;
  const c = graph.ctx;
  const out = c.createGain();
  out.gain.value = 0.9;
  out.connect(graph.fx);
  const echo = c.createGain();
  echo.gain.value = 0.35;
  out.connect(echo).connect(graph.delay);
  // The breath of the "h".
  const breath = c.createBufferSource();
  breath.buffer = graph.shots.noise;
  const bh = c.createBiquadFilter();
  bh.type = "bandpass";
  bh.frequency.value = 1700;
  bh.Q.value = 0.9;
  const gh = c.createGain();
  gh.gain.setValueAtTime(0, at);
  gh.gain.linearRampToValueAtTime(0.35, at + 0.012);
  gh.gain.exponentialRampToValueAtTime(0.001, at + 0.08);
  breath.connect(bh).connect(gh).connect(out);
  breath.start(at, Math.random() * 3);
  breath.stop(at + 0.1);
  // The voice: a buzz falling slightly in pitch, "eh" gliding to "ee".
  const buzz = c.createOscillator();
  buzz.type = "sawtooth";
  buzz.frequency.setValueAtTime(hz * 1.05, at + 0.03);
  buzz.frequency.linearRampToValueAtTime(hz * 0.95, at + 0.34);
  const vib = c.createOscillator();
  vib.frequency.value = 6;
  const vibDepth = c.createGain();
  vibDepth.gain.value = hz * 0.012;
  vib.connect(vibDepth).connect(buzz.frequency);
  const gv = c.createGain();
  gv.gain.setValueAtTime(0, at + 0.03);
  gv.gain.linearRampToValueAtTime(1, at + 0.07);
  gv.gain.setValueAtTime(1, at + 0.22);
  gv.gain.exponentialRampToValueAtTime(0.001, at + 0.38);
  buzz.connect(gv);
  const FORMANTS = [
    { from: 600, to: 390, q: 9, gain: 1 },
    { from: 1800, to: 2150, q: 12, gain: 0.55 },
    { from: 2550, to: 2750, q: 14, gain: 0.3 },
  ];
  FORMANTS.forEach((f) => {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = f.q;
    bp.frequency.setValueAtTime(f.from, at + 0.06);
    bp.frequency.linearRampToValueAtTime(f.to, at + 0.3);
    const g = c.createGain();
    g.gain.value = f.gain * 2.2;
    gv.connect(bp).connect(g).connect(out);
  });
  buzz.start(at);
  vib.start(at);
  buzz.stop(at + 0.42);
  vib.stop(at + 0.42);
};

const wave = new Float32Array(1024);

export const sound = {
  /** What reaches the speakers now: its peak and its loudness (rms), 0..1. */
  output() {
    if (!graph) return { peak: 0, rms: 0 };
    graph.analyser.getFloatTimeDomainData(wave);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < wave.length; i += 1) {
      peak = Math.max(peak, Math.abs(wave[i]));
      sum += wave[i] * wave[i];
    }
    return { peak, rms: Math.sqrt(sum / wave.length) };
  },

  /** Start: the browser lets the sound play from here on (resolves once ready). */
  unlock(): Promise<void> {
    if (!ctx) ctx = makeContext();
    if (!ctx) return Promise.resolve();
    // Play through the phone's silent switch, like a music app.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      // not supported
    }
    if (ctx.state !== "running") void ctx.resume();
    unlocked = true;
    if (!building && ctx.audioWorklet)
      building = buildGraph(ctx).catch(() => {
        graph = null;
      });
    return building ?? Promise.resolve();
  },

  get unlocked() {
    return unlocked;
  },

  /** The sound is set up and running. */
  get ready() {
    return !!graph && graph.ctx.state === "running";
  },

  /**
   * The audio clock now (s), smooth between frames; null while there is no
   * sound. `heard`: what reaches the speakers now (later by the output's
   * delay), for the lights.
   */
  now(heard = false): number | null {
    if (!graph || graph.ctx.state !== "running") return null;
    const c = graph.ctx;
    const perf = performance.now() / 1000;
    if (c.currentTime !== clock.ct) {
      clock.ct = c.currentTime;
      clock.perf = perf;
    }
    const t = clock.ct + Math.min(0.05, perf - clock.perf);
    if (!heard) return t;
    return t - (c.outputLatency || 0) - (c.baseLatency || 0);
  },

  /**
   * Hands both decks the style's loops: they switch over at `at` (audio
   * time), turning at `speed` (× the style's tempo; a turntable's pitch).
   */
  load(style: StyleId, at: number, speed = 1) {
    if (!graph) return;
    const rate = graph.ctx.sampleRate;
    DECKS.forEach((d) => {
      const l = loopOf(style, d, rate);
      graph!.decks[d].port.postMessage({
        type: "load",
        left: l.left,
        right: l.right,
        at,
        speed,
      });
    });
  },

  /** Makes the other styles' loops in the background, one at a time. */
  prepareAll() {
    if (!graph) return;
    const rate = graph.ctx.sampleRate;
    const todo = STYLES.flatMap((s) => DECKS.map((d) => [s, d] as const));
    const next = () => {
      const job = todo.shift();
      if (!job) return;
      loopOf(job[0], job[1], rate);
      window.setTimeout(next, 250);
    };
    window.setTimeout(next, 600);
  },

  start(at: number, speed = 1) {
    graph?.decks.A.port.postMessage({ type: "start", at, speed });
    graph?.decks.B.port.postMessage({ type: "start", at, speed });
  },

  stop() {
    graph?.decks.A.port.postMessage({ type: "stop" });
    graph?.decks.B.port.postMessage({ type: "stop" });
  },

  brake(deck: DeckId) {
    graph?.decks[deck].port.postMessage({ type: "brake" });
  },

  /** A scratched record: where your hand has dragged it (seconds of music). */
  scratch(deck: DeckId, target: number) {
    graph?.decks[deck].port.postMessage({ type: "scratch", target });
  },

  release(deck: DeckId) {
    graph?.decks[deck].port.postMessage({ type: "release" });
  },

  /** The crossfader's gains for each deck. */
  mix(a: number, b: number) {
    if (!graph) return;
    const t = graph.ctx.currentTime;
    graph.gains.A.gain.setTargetAtTime(a, t, 0.012);
    graph.gains.B.gain.setTargetAtTime(b, t, 0.012);
  },

  /** The filter knob: -1 low-pass … 0 open … 1 high-pass. */
  filter(v: number) {
    if (!graph) return;
    const t = graph.ctx.currentTime;
    const lowHz = v < 0 ? 20000 * (FILTER.lowest / 20000) ** -v : 20000;
    const highHz = v > 0 ? 20 * (FILTER.highest / 20) ** v : 20;
    graph.low.frequency.setTargetAtTime(lowHz, t, 0.02);
    graph.high.frequency.setTargetAtTime(highHz, t, 0.02);
  },

  /** Pad 1: a drum fill over two beats from `at`. */
  fill(at: number, bpm: number) {
    const s = beatLength(bpm) / 4;
    const order = [
      "snare",
      "snare",
      "snare",
      "snare",
      "tomHi",
      "tomHi",
      "tomLo",
      "tomLo",
    ] as const;
    order.forEach((n, k) => shot(n, at + k * s, 0.25 + 0.07 * k));
  },

  /** Pad 2: one beat from `at` goes into the echo, which rings on. */
  echo(at: number, bpm: number) {
    if (!graph) return;
    const beat = beatLength(bpm);
    graph.delay.delayTime.setValueAtTime(beat * ECHO.beats, at);
    const g = graph.echoSend.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(ECHO.send, at + 0.01);
    g.setValueAtTime(ECHO.send, at + beat - 0.01);
    g.linearRampToValueAtTime(0, at + beat);
  },

  /** Pad 3: a rising sweep from `from` to `to`. */
  riser(from: number, to: number) {
    riser(from, to, 0.45);
  },

  /** Pad 4: the vocal chop at `at`. */
  chop(at: number, style: StyleId) {
    hey(at, STYLE[style].voice);
  },

  /**
   * The drop: from `from` the music thins upwards with a rising sweep and a
   * snare roll; at `land` it all comes back with a crash and a boom.
   */
  drop(from: number, land: number, bpm: number) {
    if (!graph) return;
    const f = graph.sweep.frequency;
    f.cancelScheduledValues(from);
    f.setValueAtTime(20, from);
    f.exponentialRampToValueAtTime(DROP.sweepTo, land - 0.01);
    f.setValueAtTime(20, land);
    riser(from, land, 0.4);
    const s = beatLength(bpm) / 4;
    for (let t = land - 8 * s, k = 0; t < land - 1e-3; t += s, k += 1)
      shot("snare", t, 0.18 + 0.05 * k);
    shot("crash", land, 0.55, true);
    shot("boom", land, 1, true);
  },
};
