// The routines to learn and play: short sets on one style, each a timeline
// of cues (what to do, and on which beat). Plain code (no scene).
//
// Beats count from the routine's first bar (0 = its first downbeat); a bar
// is four beats.
import type { StyleId } from "./music";

export type CueKind =
  | "scratch"
  | "brake"
  | "fill"
  | "echo"
  | "riser"
  | "chop"
  | "drop"
  | "xfadeA"
  | "xfadeB"
  | "xfadeMid"
  | "filterLow"
  | "filterHigh"
  | "filterOpen";

export type Cue = { kind: CueKind; beat: number };

export type Routine = {
  id: string;
  title: string;
  style: StyleId;
  /** Its length (bars). */
  bars: number;
  cues: Cue[];
};

const cue = (kind: CueKind, bar: number, beat = 0): Cue => ({
  kind,
  beat: bar * 4 + beat,
});

export const ROUTINES: Routine[] = [
  {
    // Over to deck A, across to deck B, the filter down and back, a fill.
    id: "warm-up",
    title: "Warm Up",
    style: "house",
    bars: 8,
    cues: [
      cue("xfadeA", 1),
      cue("xfadeB", 2, 2),
      cue("xfadeMid", 3, 2),
      cue("filterLow", 4),
      cue("filterOpen", 5, 2),
      cue("fill", 6, 3),
    ],
  },
  {
    // Scratches on the backbeat (beats 2 and 4), then a brake to finish.
    id: "first-scratch",
    title: "First Scratch",
    style: "hiphop",
    bars: 8,
    cues: [
      cue("scratch", 1, 1),
      cue("scratch", 1, 3),
      cue("scratch", 2, 1),
      cue("scratch", 2, 3),
      cue("scratch", 3, 1),
      cue("scratch", 3, 3),
      cue("scratch", 4, 1),
      cue("scratch", 4, 3),
      cue("brake", 6),
    ],
  },
  {
    // A riser, the filter up, then the drop (and the filter open again).
    id: "build-and-drop",
    title: "Build and Drop",
    style: "house",
    bars: 8,
    cues: [
      cue("riser", 1),
      cue("filterHigh", 2),
      cue("drop", 3, 2),
      cue("filterOpen", 5),
      cue("fill", 6, 3),
    ],
  },
  {
    // Echo, vocal chops, the crossfader both ways, a fill and the drop.
    id: "disco-mix",
    title: "Disco Mix",
    style: "disco",
    bars: 16,
    cues: [
      cue("echo", 1, 2),
      cue("chop", 3),
      cue("chop", 3, 2),
      cue("xfadeA", 5),
      cue("xfadeMid", 7),
      cue("fill", 8, 3),
      cue("xfadeB", 10),
      cue("drop", 11, 2),
      cue("xfadeMid", 14),
    ],
  },
];

export const routineById = (id: string) => ROUTINES.find((r) => r.id === id);

export const nextRoutineId = (id: string) =>
  ROUTINES[(ROUTINES.findIndex((r) => r.id === id) + 1) % ROUTINES.length].id;

/** Zone cues: done while the crossfader or the filter is there. */
export const ZONE_CUES: Partial<
  Record<CueKind, (xfade: number, filter: number) => boolean>
> = {
  xfadeA: (x) => x <= 0.2,
  xfadeB: (x) => x >= 0.8,
  xfadeMid: (x) => x >= 0.38 && x <= 0.62,
  filterLow: (_, f) => f <= -0.45,
  filterHigh: (_, f) => f >= 0.45,
  filterOpen: (_, f) => Math.abs(f) <= 0.12,
};
