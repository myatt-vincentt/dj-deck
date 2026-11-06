// Routines: learning and playing along.
//
// Starting a routine switches to its style. Learn waits for you at each cue
// while the music loops: the cue card shows it in plain words, its part of
// the booth glows gold, and it counts once you do it (with your hands, the
// mouse or the keys). Play starts the routine's loops from their first bar,
// counts in for one bar, then scrolls the cues on the beat and judges each
// (perfect, good or missed); at the end, one to three stars. Slower plays at
// 0.85× (the turntables' pitch turned down). Esc, or the dock's stop button,
// ends the routine. Afterwards the style you had comes back.
import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";

import { beatLength, type StyleId } from "./music";
import { routineById } from "./routines";
import { COUNT_IN_BARS, Session, type SessionMode } from "./session";
import { clockNow, dj, restart, setStyle } from "./state";

/** Play's slower speed. */
export const SLOW = 0.85;

/** The style you had before a routine (it comes back afterwards). */
const before: { style: StyleId | null } = { style: null };

/** Each routine's best stars (Play), kept on this device. */
const BEST_KEY = "dj-deck.best";
export const bestStars = (): Record<string, number> => {
  try {
    return JSON.parse(window.localStorage.getItem(BEST_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
};
const saveBest = (id: string, stars: number) => {
  try {
    const best = bestStars();
    if ((best[id] ?? 0) >= stars) return;
    best[id] = stars;
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    // private mode: not remembered
  }
};

/** The style you had comes back (from the next bar). */
const restoreStyle = () => {
  if (before.style) setStyle(before.style, 1);
  before.style = null;
};

/** Starts a routine. */
export const startRoutine = (id: string, mode: SessionMode) => {
  const r = routineById(id);
  if (!r) return;
  if (!dj.session && before.style === null) before.style = dj.style;
  let t0: number;
  let spb: number;
  if (mode === "play") {
    const speed = dj.slow ? SLOW : 1;
    const at = restart(r.style, speed);
    spb = beatLength(dj.transport.bpm);
    t0 = at + COUNT_IN_BARS * 4 * spb;
  } else {
    setStyle(r.style, 1);
    t0 = clockNow();
    spb = beatLength(dj.transport.bpm);
  }
  dj.actions = [];
  dj.session = new Session(r, mode, t0, spb);
  dj.card = null;
  dj.howTo = false;
  dj.howToUntil = null;
  dj.finish = null;
  dj.changed();
};

/** Ends the routine (free play carries on, in the style you had). */
export const stopRoutine = () => {
  if (!dj.session) return;
  dj.session = null;
  restoreStyle();
  dj.changed();
};

/** The finish card goes. */
export const closeFinish = () => {
  dj.finish = null;
  dj.changed();
};

export const RoutinePlayer = () => {
  // Esc ends the routine, or closes the routines card or the finish card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dj.session) stopRoutine();
      else if (dj.card || dj.finish) {
        dj.card = null;
        dj.finish = null;
        dj.changed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame(() => {
    const s = dj.session;
    if (!s) {
      dj.actions = [];
      return;
    }
    const now = clockNow();
    dj.actions.forEach((a) => s.action(a.kind, a.at));
    dj.actions = [];
    s.update(now, dj.xfade, dj.filter);
    let dirty = false;
    s.events.forEach((e) => {
      if (e.kind === "miss") dj.cueFx.miss += 1;
      else {
        dj.cueFx.seq += 1;
        dj.cueFx.perfect = e.kind === "perfect";
      }
      dirty = true;
    });
    s.events = [];
    if (s.done) {
      const stars = s.mode === "play" ? s.stars : 3;
      if (s.mode === "play") saveBest(s.routine.id, stars);
      dj.finish = {
        id: s.routine.id,
        mode: s.mode,
        stars,
        at: performance.now(),
      };
      dj.session = null;
      restoreStyle();
      dirty = true;
    }
    if (dirty) dj.changed();
  }, -1);

  return null;
};
