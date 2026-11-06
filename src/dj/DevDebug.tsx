// Development only: window.__dj, a look inside for testing without a
// camera — the state, and controls:
//
//   __dj.style("disco"), __dj.play(false), __dj.xfade(0.2), __dj.filter(-0.5)
//   __dj.pad(1) … __dj.pad(4), __dj.drop()
//   __dj.hold("B"), __dj.scratch("B", 0.8), __dj.release("B")
//   __dj.view("player"), __dj.night(true)
//   __dj.look([x, y, z], [tx, ty, tz], fov)   a fixed camera (null: back)
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import { sound } from "./audio";
import { cameraOverride } from "./CameraRig";
import type { View } from "./layout";
import type { DeckId, StyleId } from "./music";
import {
  dj,
  drop,
  holdDeck,
  pad,
  releaseDeck,
  scratchDeck,
  setCrossfade,
  setFilter,
  setNight,
  setPlaying,
  setStyle,
  setView,
  type PadId,
} from "./state";

const DevDebug = () => {
  const camera = useThree((st) => st.camera);
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const api = {
      dj,
      camera,
      scene,
      sound,
      style: (s: StyleId) => setStyle(s),
      play: (on = true) => setPlaying(on),
      xfade: (x: number) => setCrossfade(x),
      filter: (v: number) => setFilter(v),
      pad: (k: PadId) => pad(k),
      drop: () => drop(),
      hold: (d: DeckId = "B") => holdDeck(d),
      scratch: (d: DeckId, radians: number) => scratchDeck(d, radians),
      release: (d: DeckId = "B") => releaseDeck(d),
      view: (v: View) => setView(v),
      night: (on: boolean) => setNight(on),
      look(pos: number[] | null, target: number[] = [0, 1.1, -0.4], fov = 40) {
        cameraOverride.pose = pos
          ? { pos: new Vector3(...pos), target: new Vector3(...target), fov }
          : null;
      },
    };
    (window as unknown as { __dj?: typeof api }).__dj = api;
    return () => {
      delete (window as unknown as { __dj?: typeof api }).__dj;
    };
  }, [camera, scene]);
  return null;
};

export default DevDebug;
