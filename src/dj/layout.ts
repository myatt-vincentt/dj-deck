// The screen layout: where the booth's parts and the ghost hands are, where
// the camera looks from in each view, how much it shows, and where the
// corner camera sits.
//
// Coordinates are the room's (metres, y up). The booth stands in the room's
// middle, its front facing the audience (+z); the DJ stands behind it (−z).
// Deck A (teal) is on the DJ's left (+x), deck B (magenta) on the DJ's right
// (−x); the mixer sits between them.
import { Quaternion, Vector3 } from "three";

import type { DeckId } from "./music";

export type View = "front" | "player" | "close";
export const VIEWS: View[] = ["front", "player", "close"];

/** Screen shape → 0 (laptop, wide) … 1 (phone, tall). */
export const phoneness = (aspect: number) =>
  Math.min(1, Math.max(0, (1.5 - aspect) / (1.5 - 0.56)));

export type CameraPose = {
  pos: Vector3;
  target: Vector3;
  /** Vertical field of view (degrees). */
  fov: number;
};

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
/** The vertical field of view that gives this horizontal one. */
export const vfovFromH = (hfov: number, aspect: number) =>
  deg(2 * Math.atan(Math.tan(rad(hfov) / 2) / Math.max(0.1, aspect)));
/** The horizontal field of view of this vertical one. */
export const hfovFromV = (vfov: number, aspect: number) =>
  deg(2 * Math.atan(Math.tan(rad(vfov) / 2) * aspect));

const v3 = (x: number, y: number, z: number) => new Vector3(x, y, z);

// ---------------------------------------------------------------- the booth

/** The records: their centres (on the record's top) and radius (m). */
export const RECORD: Record<DeckId, Vector3> = {
  A: v3(0.495, 1.112, -0.4),
  B: v3(-0.375, 1.112, -0.4),
};
export const RECORD_RADIUS = 0.1515;
/** The record's label (it turns with the record). */
export const LABEL_RADIUS = 0.0505;

/** The crossfader's knob at each end of its slot (A: the DJ's left). */
export const CROSSFADER = {
  A: v3(0.061, 1.11, -0.578),
  B: v3(-0.061, 1.11, -0.578),
};
/** The filter knob's centre, and its pointer's turn either way (radians). */
export const FILTER_KNOB = { center: v3(0, 1.11, -0.26), turn: rad(135) };
/** The mixer's panel top (the pads, knobs and sliders sit on it). */
export const PANEL_Y = 1.11;
/** The pads' centres (1 on the DJ's left … 4 on the right) and size (m). */
export const PAD_POS = [
  v3(0.105, 1.11, -0.42),
  v3(0.035, 1.11, -0.42),
  v3(-0.035, 1.11, -0.42),
  v3(-0.105, 1.11, -0.42),
];
export const PAD_SIZE = { x: 0.056, z: 0.04 };
/** The level meters: the bottom LED's centre, the step between LEDs, how many. */
export const METER = {
  A: v3(0.022, 1.11, -0.38),
  B: v3(-0.022, 1.11, -0.38),
  step: 0.0079,
  count: 10,
};
/** The filter's LED ring: its radius and its 11 LEDs' angles (degrees, clockwise from the top). */
export const FILTER_RING = { radius: 0.0255, first: -135, step: 27, count: 11 };
/** The speaker cones (their faces) and which way they face. */
export const SPEAKER = {
  L: v3(1.1826, 0.36, -0.1439),
  R: v3(-1.1826, 0.36, -0.1439),
};

/** The booth's front face (z), the floor glow in front of it. */
export const BOOTH = { front: 0.01, width: 1.8, depth: 0.72, centerZ: -0.3 };

/** The night beams: from the ceiling down onto the booth. */
export const BEAMS = [
  {
    from: v3(-1.05, 2.97, 0.55),
    to: v3(-0.25, 1.05, -0.45),
    colour: "#F2389F",
  },
  {
    from: v3(1.05, 2.97, 0.55),
    to: v3(0.3, 1.05, -0.45),
    colour: "#26D9CC",
  },
];

/** The colours of the booth's lights and the ghost hands. */
export const COLOURS = {
  teal: "#16C2B5",
  magenta: "#E8318A",
  pads: ["#6FE8D6", "#FF8CC4", "#FFC870", "#B49BFF"],
  boothLed: "#FFE1B4",
  filter: "#B49BFF",
  ledGreen: "#7CFF9F",
  ledAmber: "#FFD45A",
  ledRed: "#FF6050",
  streak: "#FFC74D",
  ghost: "#F2B21C",
  ghostGlow: "#FFB000",
};
export const DECK_COLOUR: Record<DeckId, string> = {
  A: COLOURS.teal,
  B: COLOURS.magenta,
};

export type Placement = { pos: Vector3; quat: Quaternion; mirror?: boolean };
const place = (p: number[], q: number[], mirror = false): Placement => ({
  pos: new Vector3(p[0], p[1], p[2]),
  quat: new Quaternion(q[0], q[1], q[2], q[3]).normalize(),
  mirror,
});

/**
 * The ghost hands' reference poses (the hand's root at the wrist): the
 * scratch hand (your right) flat on deck B's record; the fader hand (your
 * left, the same hand mirrored) with two fingers on the crossfader.
 */
export const HAND_REF = {
  scratch: place(
    [-0.3476, 1.1414, -0.5688],
    [-0.07553, -0.78015, -0.61355, 0.09604],
  ),
  fader: place(
    [0.0919, 1.1959, -0.7202],
    [-0.12702, 0.64934, 0.74152, 0.11123],
    true,
  ),
};
/** In the reference pose the crossfader's knob is here (0 = A … 1 = B). */
export const HAND_REF_XFADE = (0.061 - 0.018) / 0.122;

// ---------------------------------------------------------------- the views

// Each view's camera: on a laptop (16:9) the vertical field of view, on a
// phone (9:16) the horizontal one it gives. The views widen from there just
// enough to keep their parts on screen (CameraRig.tsx).
const P = 9 / 16;
const FRONT = {
  laptop: { pos: [0.2, 2.15, 1.55], target: [0, 0.94, -0.3], vfov: 42.55 },
  phone: {
    pos: [0.05, 2.1, 0.45],
    target: [0, 1.0, -0.4],
    hfov: hfovFromV(80, P),
  },
};
const PLAYER = {
  laptop: { pos: [0, 1.62, -1.02], target: [0, 1.0, -0.3], vfov: 53.7 },
  phone: {
    pos: [-0.05, 1.8, -0.98],
    target: [-0.05, 1.0, -0.3],
    hfov: hfovFromV(66, P),
  },
};
const CLOSE = {
  laptop: {
    pos: [-0.675, 1.412, -0.82],
    target: [-0.345, 1.132, -0.42],
    vfov: 37.3,
  },
  phone: {
    pos: [-0.56, 1.5, -0.78],
    target: [-0.36, 1.132, -0.42],
    hfov: hfovFromV(72, P),
  },
};
const VIEW_POSES = { front: FRONT, player: PLAYER, close: CLOSE };

/* eslint-disable no-param-reassign */
/** A view's camera for this screen shape (before the fit). */
export const viewPose = (view: View, aspect: number, out: CameraPose) => {
  const v = VIEW_POSES[view];
  const k = phoneness(aspect);
  const [lx, ly, lz] = v.laptop.pos;
  const [px, py, pz] = v.phone.pos;
  out.pos.set(lx + (px - lx) * k, ly + (py - ly) * k, lz + (pz - lz) * k);
  const [ltx, lty, ltz] = v.laptop.target;
  const [ptx, pty, ptz] = v.phone.target;
  out.target.set(
    ltx + (ptx - ltx) * k,
    lty + (pty - lty) * k,
    ltz + (ptz - ltz) * k,
  );
  const phoneV = vfovFromH(v.phone.hfov, aspect);
  out.fov = v.laptop.vfov + (phoneV - v.laptop.vfov) * k;
  return out;
};
/* eslint-enable no-param-reassign */

/**
 * The points a view keeps on screen. Front: the booth and both speakers
 * (on a tall screen: the decks and the mixer). Player: both decks and the
 * mixer with the fader hand. Close: deck B's record and the mixer's edge
 * (on a tall screen: the record).
 */
export const keepPoints = (view: View, phone = false): Vector3[] => {
  const rb = RECORD.B;
  const r = RECORD_RADIUS + 0.01;
  if (view === "close")
    return phone
      ? [
          v3(rb.x - r, rb.y, rb.z),
          v3(rb.x + r, rb.y, rb.z),
          v3(rb.x, rb.y, rb.z - r),
          v3(rb.x, rb.y, rb.z + r),
        ]
      : [
          v3(rb.x - r, rb.y, rb.z),
          v3(rb.x + r, rb.y, rb.z),
          v3(rb.x, rb.y, rb.z - r),
          v3(rb.x, rb.y, rb.z + r),
          v3(-0.12, 1.11, -0.45),
        ];
  if (view === "player")
    return [
      v3(0.72, 1.09, -0.4),
      v3(-0.6, 1.09, -0.4),
      v3(0.1, 1.11, -0.6),
      v3(0.1, 1.27, -0.72),
      v3(0, 1.0, 0.02),
    ];
  if (phone)
    return [
      v3(0.72, 1.1, -0.4),
      v3(-0.6, 1.1, -0.4),
      v3(0, 1.0, 0.02),
      v3(0.1, 1.3, -0.72),
    ];
  return [
    v3(1.42, 1.0, -0.1),
    v3(-1.42, 1.0, -0.1),
    v3(0.85, 0.02, 0.02),
    v3(-0.85, 0.02, 0.02),
    v3(0.1, 1.32, -0.72),
  ];
};

// ---------------------------------------------------------------- page UI

/** The page gutter (CSS px). */
export const GUTTER = 16;
/** The corner camera's corner radius (CSS px). */
export const FRAME_RADIUS = 16;
/** The dock's distance from the bottom edge, and its height (CSS px). */
export const DOCK_BOTTOM = 22;
export const DOCK_HEIGHT = 58;
/** Room above the dock kept for its cards (CSS px). */
export const ABOVE_DOCK = 20;

/** Where the corner camera sits (CSS px): top right. */
export const frameRect = (width: number, height: number) => {
  // Portrait-ish on a phone, landscape-ish on a laptop, never extreme.
  const aspect = Math.min(1.33, Math.max(0.75, width / Math.max(1, height)));
  const h = Math.min(220, Math.max(110, height * 0.24));
  const w = Math.round(h * aspect);
  return {
    left: width - GUTTER - w,
    top: GUTTER,
    width: w,
    height: Math.round(h),
  };
};

/**
 * The screen's edges the view keeps clear (NDC, 1 = the edge): the top, and
 * under the corner camera right of its left edge (`frameLeft`); the dock
 * below.
 */
export const viewMargins = (width: number, height: number) => {
  const h = Math.max(1, height);
  const w = Math.max(1, width);
  const frame = frameRect(width, height);
  const bottomPx = DOCK_BOTTOM + DOCK_HEIGHT + ABOVE_DOCK;
  return {
    side: 0.96,
    top: 1 - (2 * 24) / h,
    under: Math.max(0.2, 1 - (2 * (frame.top + frame.height + 12)) / h),
    frameLeft: (2 * (frame.left - 8)) / w - 1,
    bottom: Math.max(0.3, 1 - (2 * bottomPx) / h),
  };
};

/**
 * For drei's `<Html fullscreen>`: pin the page UI to the screen. By default
 * it follows the scene's origin, which moves on screen with the camera.
 */
export const pinToScreen = (
  _el: unknown,
  _camera: unknown,
  size: { width: number; height: number },
) => [size.width / 2, size.height / 2];
