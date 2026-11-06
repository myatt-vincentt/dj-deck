// Your two hands, read from the hand tracker every frame (handPlay.ts):
//   - your right hand (the deck hand): an open palm moved quickly side to
//     side scratches deck B; a fist brakes it
//   - your left hand (the mixer hand): across is the crossfader, up and
//     down the filter
//   - either hand: 1–4 fingers held still fire pads 1–4
//   - both open palms raised high, then pulled down fast: the drop
// The tracker names hands as they are on your body (left is your left),
// whichever way the camera shows them. While the mouse holds a record or a
// slider, the hands leave that part alone. With no hands the music plays on.
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { XRModel } from "@vincentt-xr/sdk";
import {
  useXRModelNode,
  type XRModelNodeHandTracking,
} from "@vincentt-xr/sdk/low-level";

import { HandDj, type HandIn, type Palm } from "./handPlay";
import { pointerBusy } from "./PointerInput";
import { SignReader, type Joint } from "./signs";
import {
  closeHowTo,
  dj,
  drop,
  HAND,
  holdDeck,
  pad,
  PAD_LABEL,
  releaseDeck,
  scratchDeck,
  setCrossfade,
  setFilter,
} from "./state";

/** What the ghost hands, the corner camera and the development checks read about your hands. */
export const hands = {
  deckTracked: false,
  mixerTracked: false,
  /** Each palm on the picture (0..1 across, 0..1 down), while in view. */
  deckPalm: null as Palm | null,
  mixerPalm: null as Palm | null,
  /** What each hand shows right now. */
  deckSign: null as string | null,
  mixerSign: null as string | null,
  scratching: false,
  braking: false,
  /** The mixer hand has taken over the crossfader and filter. */
  engaged: false,
  /** Both palms are up, ready to pull down for the drop. */
  dropArmed: false,
  /** The latest action, for the corner's tag (performance.now() / 1000). */
  action: { label: "", at: -1e9 },
};

type Pose = {
  image: { x: number; y: number }[];
  world: Joint[];
  timestampMs: number;
  held?: boolean;
};

const PALM = [0, 5, 9, 13, 17];

/** The palm's middle on the picture (0..1 across, 0..1 down, as you see it). */
const palmOf = (p: Pose): Palm => {
  let x = 0;
  let y = 0;
  PALM.forEach((i) => {
    x += p.image[i].x / PALM.length;
    y += p.image[i].y / PALM.length;
  });
  return { x: x * 0.5 + 0.5, y: 0.5 - y * 0.5 };
};

const tag = (label: string) => {
  hands.action = { label, at: performance.now() / 1000 };
};

export const Hands = () => {
  const node = useXRModelNode<XRModelNodeHandTracking>(XRModel.HAND_TRACKER);
  const st = useRef({
    player: new HandDj(),
    signs: { deck: new SignReader(), mixer: new SignReader() },
    stamp: { deck: -1, mixer: -1 },
    scratching: false,
    braking: false,
  });

  useFrame(() => {
    const s = st.current;
    const on = dj.started;
    const pick = (side: "left" | "right") => {
      const p = on ? ((node?.poses?.[side] ?? null) as Pose | null) : null;
      return p && !p.held ? p : null;
    };
    const dp = pick(HAND.deck);
    const mp = pick(HAND.mixer);
    hands.deckTracked = !!dp;
    hands.mixerTracked = !!mp;
    const fresh =
      (dp && dp.timestampMs !== s.stamp.deck) ||
      (mp && mp.timestampMs !== s.stamp.mixer);
    // A new reading, or no hands (the glides carry on).
    if (!fresh && (dp || mp)) return;
    const t = performance.now() / 1000;
    const read = (p: Pose | null, which: "deck" | "mixer"): HandIn | null => {
      const r = s.signs[which];
      if (!p) {
        r.lost();
        return null;
      }
      if (p.timestampMs !== s.stamp[which]) {
        s.stamp[which] = p.timestampMs;
        r.push(p.timestampMs / 1000, p.world);
      }
      return { palm: palmOf(p), sign: r.sign, raw: r.raw };
    };
    const deck = read(dp, "deck");
    const mixer = read(mp, "mixer");
    hands.deckPalm = deck?.palm ?? null;
    hands.mixerPalm = mixer?.palm ?? null;
    hands.deckSign = deck?.raw ?? null;
    hands.mixerSign = mixer?.raw ?? null;
    s.player.setMixer(dj.xfade, dj.filter);
    const out = s.player.update({ t, deck, mixer });
    hands.engaged = out.engaged;
    hands.dropArmed = out.dropArmed;
    if ((deck || mixer) && dj.howTo && dj.howToUntil !== null) closeHowTo();

    // The deck hand (unless the mouse holds deck B).
    const free = pointerBusy.record !== "B";
    const brake = free && out.brake;
    const scratch = free && out.scratch !== null;
    if (brake && !s.braking) {
      if (s.scratching) releaseDeck("B");
      holdDeck("B");
      tag("Brake");
    }
    if (scratch) {
      scratchDeck("B", out.scratch as number);
      if (!s.scratching) tag("Scratch");
    }
    if (
      free &&
      ((s.braking && !brake && !scratch) ||
        (s.scratching && !scratch && !brake))
    )
      releaseDeck("B");
    s.braking = brake;
    s.scratching = scratch;
    hands.braking = brake;
    hands.scratching = scratch;
    if (scratch || brake) hands.action.at = t;

    out.pads.forEach((k) => {
      pad(k);
      tag(PAD_LABEL[k]);
    });
    if (out.drop) {
      drop();
      tag("Drop");
    }
    if (!pointerBusy.mixer) {
      if (out.xfade !== null && Math.abs(out.xfade - dj.xfade) > 1e-4)
        setCrossfade(out.xfade);
      if (out.filter !== null && Math.abs(out.filter - dj.filter) > 1e-4)
        setFilter(out.filter);
    }
  });

  return null;
};
