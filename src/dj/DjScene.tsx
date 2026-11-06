// DJ Deck: two turntables and a mixer on a DJ booth in a recording studio.
// Both decks play loops made in code, always in time; the crossfader blends
// them, the filter sweeps them, the pads add a fill, an echo, a riser or a
// vocal chop, and a drop brings it all crashing back in. Scratch a record and
// it follows you, forwards and back. Your right hand scratches and brakes,
// your left hand mixes, finger signs fire the pads and both palms pulled
// down drop the beat. Two gold ghost hands play with you. Your camera sits
// small in the corner.
//
//   CameraRig.tsx     the views (front, player, close), fitted to the screen (layout.ts)
//   Studio.tsx        the room and its light, day and night; the LEDs pulse with the kick
//   Booth.tsx         the turntables, the mixer and the speakers, and what moves on them
//   Fx.tsx            the light show: night beams, floor glow, speaker rings, scratch streaks
//   GhostHands.tsx    the two gold ghost hands
//   Hands.tsx         your hands: the deck hand, the mixer hand, signs and
//                     the drop (handPlay.ts, signs.ts; guides in CameraGuides.tsx)
//   PointerInput.tsx  dragging the records, sliders and pads, and the keys
//   CameraFrame.tsx   your camera in the corner
//   Hud.tsx           the bottom dock, its style and effects cards, how to play
//   Home.tsx          the home page (Start), shown over the scene while it loads
//   state.ts          the beat, the decks, the mixer and the pads
//   deck.ts           how a record moves (play, brake, scratch)
//   music.ts          the four styles' loops, made in code
//   audio.ts          the decks, the mixer and the effects in Web Audio
import { Suspense, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { HandTracker } from "@vincentt-xr/sdk/tracking";

import { Booth } from "./Booth";
import { CameraFrame } from "./CameraFrame";
import { CameraRig } from "./CameraRig";
import { Fx } from "./Fx";
import { GhostHands } from "./GhostHands";
import { Hands } from "./Hands";
import { Hud } from "./Hud";
import { PointerInput } from "./PointerInput";
import { dj, tick, useDjVersion } from "./state";
import { Studio } from "./Studio";

/** Hand readings per second. */
const HAND_FPS = 30;

/** Mounts once everything above it has loaded (the home page waits for it). */
const Loaded = () => {
  useEffect(() => {
    dj.loaded = true;
    dj.changed();
  }, []);
  return null;
};

/** The beat and the records follow the clock, once a frame (before anything is drawn). */
const BeatLoop = () => {
  useFrame((_, dt) => tick(Math.min(dt, 0.1)), -2);
  return null;
};

export const DjScene = () => {
  useDjVersion();
  return (
    <>
      <BeatLoop />
      <CameraRig />
      <Suspense fallback={null}>
        <Studio />
        <Booth />
        <Fx />
        <GhostHands />
        <Loaded />
      </Suspense>
      {dj.started ? <HandTracker targetFps={HAND_FPS} /> : null}
      <Hands />
      <CameraFrame />
      <PointerInput />
      <Hud />
    </>
  );
};
