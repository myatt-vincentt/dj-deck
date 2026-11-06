// The two gold ghost hands, playing with you:
//   - the scratch hand (your right) flat on a record: it sits on the deck
//     you play, turns round the record with a scratch, rests on it while it
//     brakes (curling into a fist) and lifts a little off it otherwise
//   - the fader hand (your left, the same hand mirrored) with two fingers on
//     the crossfader: it slides with it, and rises for the high-pass filter
//     and sinks for the low-pass
// They follow what is played (a drag, the keys, and later your own hands),
// and breathe a little when still. Every move eases out, never past.
//
// The model holds one right hand in four poses with the same vertices
// (scratch, fader, open, fist); they become one mesh whose shape blends
// between them.
import { useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";

import { ghostMaterial } from "./ghost";
import {
  COLOURS,
  CROSSFADER,
  HAND_REF,
  HAND_REF_XFADE,
  RECORD,
  type Placement,
} from "./layout";
import { MODELS, useOptionalModel } from "./models";
import { dj } from "./state";

/** The poses: the base shape, and the ones it can blend towards. */
const BASE = "DJHand_Scratch";
const TOWARDS = ["DJHand_Fader", "DJHand_Open", "DJHand_Fist"] as const;
const FADER = 0;
const FIST = 2;
/** Breathing when still: how far (m) and how slowly (s per breath). */
const BREATH = { reach: 0.003, period: 3.6 };
/**
 * The scratch hand: how high it hovers over a record it isn't holding, and
 * over a braking one (as a fist, m); how far it turns with a scratch
 * (radians, either way); how fast it moves (time constants, s).
 */
const SCRATCH_HAND = { hover: 0.022, fistLift: 0.035, turn: 0.9, ease: 0.07 };
/** The fader hand: its height over the knob (m) at the low-pass … high-pass end. */
const FADER_HAND = { low: 0.0, high: 0.06, ease: 0.06 };

/**
 * A pose's vertices (and normals) in the base pose's own frame: each pose
 * mesh is placed (and quantised) differently, so the vertices are brought
 * through the room and back into the base mesh's frame.
 */
const inBaseFrame = (pose: Mesh, base: Mesh) => {
  pose.updateWorldMatrix(true, false);
  base.updateWorldMatrix(true, false);
  const toBase = new Matrix4()
    .copy(base.matrixWorld)
    .invert()
    .multiply(pose.matrixWorld);
  const g = pose.geometry;
  const pos = g.getAttribute("position");
  const nor = g.getAttribute("normal");
  const p = new Float32Array(pos.count * 3);
  const n = new Float32Array(pos.count * 3);
  const v = new Vector3();
  const normalMat = new Matrix4().copy(toBase);
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).applyMatrix4(toBase);
    p.set([v.x, v.y, v.z], i * 3);
    if (nor) {
      v.fromBufferAttribute(nor, i).transformDirection(normalMat);
      n.set([v.x, v.y, v.z], i * 3);
    }
  }
  return { p, n };
};

/** One blendable hand mesh, in the hand's frame (wrist at the origin). */
const blendHand = (src: Object3D) => {
  const root = src.getObjectByName("GhostHand_DJ") ?? src;
  const base = root.getObjectByName(BASE) as Mesh | undefined;
  if (!base?.isMesh) return null;
  const rootInv = new Matrix4();
  root.updateWorldMatrix(true, true);
  rootInv.copy(root.matrixWorld).invert();
  const own = inBaseFrame(base, base);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(own.p, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(own.n, 3));
  if (base.geometry.index) geometry.setIndex(base.geometry.index.clone());
  const targets = TOWARDS.map((name) => {
    const pose = root.getObjectByName(name) as Mesh | undefined;
    if (!pose?.isMesh) return own;
    return inBaseFrame(pose, base);
  });
  // Morph targets hold the difference from the base.
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = targets.map(
    (t) =>
      new Float32BufferAttribute(
        t.p.map((x, i) => x - own.p[i]),
        3,
      ),
  );
  geometry.morphAttributes.normal = targets.map(
    (t) =>
      new Float32BufferAttribute(
        t.n.map((x, i) => x - own.n[i]),
        3,
      ),
  );
  geometry.computeBoundingSphere();
  // The base mesh's placement within the hand.
  const placeInHand = new Matrix4().copy(rootInv).multiply(base.matrixWorld);
  return { geometry, placeInHand };
};

const depthOnly = new MeshBasicMaterial({
  colorWrite: false,
  side: DoubleSide,
});

type Hand = { holder: Group; mesh: Mesh; ref: Placement };

/** A ghost hand: a depth-only copy drawn first, so only its outer surface shows. */
const makeHand = (
  made: NonNullable<ReturnType<typeof blendHand>>,
  ref: Placement,
): Hand => {
  const holder = new Group();
  const look = ghostMaterial(COLOURS.ghost, COLOURS.ghostGlow);
  const mesh = new Mesh(made.geometry, look);
  mesh.applyMatrix4(made.placeInHand);
  mesh.morphTargetInfluences = TOWARDS.map(() => 0);
  mesh.renderOrder = 5;
  const depth = new Mesh(made.geometry, depthOnly);
  depth.morphTargetInfluences = mesh.morphTargetInfluences;
  depth.renderOrder = 4;
  mesh.add(depth);
  holder.add(mesh);
  holder.quaternion.copy(ref.quat);
  if (ref.mirror) holder.scale.set(-1, 1, 1);
  holder.position.copy(ref.pos);
  return { holder, mesh, ref };
};

const UP = new Vector3(0, 1, 0);

export const GhostHands = () => {
  const src = useOptionalModel(MODELS.ghostHand);

  const hands = useMemo(() => {
    if (!src) return null;
    const made = blendHand(src);
    if (!made) return null;
    return {
      scratch: makeHand(made, HAND_REF.scratch),
      fader: makeHand(made, HAND_REF.fader),
    };
  }, [src]);

  const st = useMemo(
    () => ({
      deck: new Vector3().subVectors(RECORD[dj.handDeck], RECORD.B),
      turn: 0,
      lift: SCRATCH_HAND.hover,
      fist: 0,
      x: 0,
      y: 0,
    }),
    [],
  );
  const tmp = useMemo(
    () => ({ v: new Vector3(), q: new Quaternion(), c: new Vector3() }),
    [],
  );

  useFrame((_, rawDt) => {
    if (!hands) return;
    const dt = Math.min(rawDt, 0.1);
    const now = performance.now() / 1000;
    const b = BREATH.reach * Math.sin((2 * Math.PI * now) / BREATH.period);
    const ease = (tau: number) => 1 - Math.exp(-dt / tau);

    // The scratch hand.
    const d = dj.handDeck;
    const deck = dj.decks[d];
    const held = deck.mode === "scratch" || deck.mode === "brake";
    tmp.v.subVectors(RECORD[d], RECORD.B);
    st.deck.lerp(tmp.v, ease(0.12));
    const turnWant =
      deck.mode === "scratch"
        ? Math.max(
            -SCRATCH_HAND.turn,
            Math.min(SCRATCH_HAND.turn, -dj.scratchAngle[d]),
          )
        : 0;
    st.turn +=
      (turnWant - st.turn) * ease(deck.mode === "scratch" ? 0.03 : 0.2);
    const fistWant = deck.mode === "brake" ? 1 : 0;
    st.fist += (fistWant - st.fist) * ease(SCRATCH_HAND.ease);
    let liftWant = held ? 0 : SCRATCH_HAND.hover;
    if (deck.mode === "brake") liftWant = SCRATCH_HAND.fistLift;
    st.lift += (liftWant - st.lift) * ease(SCRATCH_HAND.ease);
    const s = hands.scratch;
    // Turned round the record's centre.
    tmp.c.copy(RECORD.B).add(st.deck);
    tmp.q.setFromAxisAngle(UP, st.turn);
    s.holder.position
      .copy(HAND_REF.scratch.pos)
      .add(st.deck)
      .sub(tmp.c)
      .applyQuaternion(tmp.q)
      .add(tmp.c);
    s.holder.position.y += st.lift + b * (held ? 0.2 : 1);
    s.holder.quaternion.copy(tmp.q).multiply(HAND_REF.scratch.quat);
    const si = s.mesh.morphTargetInfluences;
    if (si) si[FIST] = st.fist;

    // The fader hand.
    const f = hands.fader;
    tmp.v.lerpVectors(CROSSFADER.A, CROSSFADER.B, dj.xfade);
    tmp.c.lerpVectors(CROSSFADER.A, CROSSFADER.B, HAND_REF_XFADE);
    st.x += (tmp.v.x - tmp.c.x - st.x) * ease(FADER_HAND.ease);
    const yWant =
      FADER_HAND.low +
      ((FADER_HAND.high - FADER_HAND.low) * (dj.filter + 1)) / 2;
    st.y += (yWant - st.y) * ease(FADER_HAND.ease);
    f.holder.position.copy(HAND_REF.fader.pos);
    f.holder.position.x += st.x;
    f.holder.position.y += st.y + b * 0.4;
    const fi = f.mesh.morphTargetInfluences;
    if (fi) fi[FADER] = 1;
  });

  // The hands go into the room once they are on screen.
  const group = useMemo(() => new Group(), []);
  useLayoutEffect(() => {
    if (!hands) return undefined;
    group.add(hands.scratch.holder, hands.fader.holder);
    return () => {
      group.remove(hands.scratch.holder, hands.fader.holder);
    };
  }, [hands, group]);

  return <primitive object={group} />;
};
