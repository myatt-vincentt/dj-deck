// Playing with a mouse, fingers or the computer keyboard, no hands needed:
//   A record   press and hold: it brakes to a stop; drag round: it follows
//              and scratches (forwards and back). Let go: it drops back on
//              the beat.
//   The crossfader   drag it sideways (towards a deck plays more of it)
//   The filter knob  drag up for the high-pass, down for the low-pass
//   The pads   tap them; the keys 1–4 do the same. D drops the beat.
//   Space plays or stops; ← → move the crossfader, ↑ ↓ turn the filter.
// Works in every view (the parts are found where they are on screen).
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
} from "three";

import {
  CROSSFADER,
  FILTER_KNOB,
  PAD_POS,
  PAD_SIZE,
  RECORD,
  RECORD_RADIUS,
} from "./layout";
import { DECKS, type DeckId } from "./music";
import {
  dj,
  drop,
  holdDeck,
  pad,
  PADS,
  releaseDeck,
  scratchDeck,
  setCrossfade,
  setFilter,
  togglePlay,
  type PadId,
} from "./state";

/** Is this event on a control (the dock, a card, the camera, the media switcher…)? */
const onControl = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return !!el?.closest?.(
    "[data-hud], button, select, input, textarea, a, [role='button']",
  );
};

/** A turn this big (radians) starts a scratch; less is a hold (a brake). */
const SCRATCH_START = 0.05;
/** Dragging the filter this far (CSS px) turns it end to end. */
const FILTER_DRAG = 260;
/** The keys' steps. */
const KEY_STEP = { xfade: 0.125, filter: 0.125 };

type Target =
  | { kind: "record"; deck: DeckId }
  | { kind: "crossfader" }
  | { kind: "filter" }
  | { kind: "pad"; pad: PadId };

/** Invisible shapes to find what is under the pointer (a little larger than the parts). */
const makeTargets = () => {
  const mat = new MeshBasicMaterial();
  const list: { mesh: Mesh; target: Target }[] = [];
  const add = (mesh: Mesh, target: Target) => {
    mesh.updateMatrixWorld(true);
    list.push({ mesh, target });
  };
  DECKS.forEach((d) => {
    const m = new Mesh(
      new CylinderGeometry(
        RECORD_RADIUS + 0.012,
        RECORD_RADIUS + 0.012,
        0.03,
        48,
      ),
      mat,
    );
    m.position.copy(RECORD[d]);
    add(m, { kind: "record", deck: d });
  });
  const xf = new Mesh(new BoxGeometry(0.17, 0.035, 0.05), mat);
  xf.position.copy(CROSSFADER.A).lerp(CROSSFADER.B, 0.5);
  xf.position.y += 0.008;
  add(xf, { kind: "crossfader" });
  const fk = new Mesh(new CylinderGeometry(0.036, 0.036, 0.04, 32), mat);
  fk.position.copy(FILTER_KNOB.center);
  add(fk, { kind: "filter" });
  PAD_POS.forEach((p, i) => {
    const m = new Mesh(
      new BoxGeometry(PAD_SIZE.x + 0.008, 0.02, PAD_SIZE.z + 0.008),
      mat,
    );
    m.position.copy(p);
    add(m, { kind: "pad", pad: PADS[i] });
  });
  return list;
};

export const PointerInput = () => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const touchWas = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    const targets = makeTargets();
    const meshes: Object3D[] = targets.map((t) => t.mesh);
    const ray = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();

    const aim = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(
        ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
        -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
      );
      ray.setFromCamera(ndc, camera);
    };
    const pick = (e: PointerEvent): Target | null => {
      aim(e);
      const h = ray.intersectObjects(meshes, false)[0];
      if (!h) return null;
      return targets.find((t) => t.mesh === h.object)?.target ?? null;
    };
    /** Where the pointer meets the level plane at this height. */
    const onPlane = (e: PointerEvent, y: number) => {
      aim(e);
      return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), hit);
    };
    /** The pointer's angle round a record (clockwise from above), or null. */
    const angleOn = (e: PointerEvent, d: DeckId) => {
      const p = onPlane(e, RECORD[d].y);
      if (!p) return null;
      return -Math.atan2(-(p.z - RECORD[d].z), p.x - RECORD[d].x);
    };

    type Drag = {
      id: number;
      target: Target;
      /** Records: the last angle, and the turn so far. */
      angle: number;
      turn: number;
      scratching: boolean;
      /** Sliders: where it started. */
      startX: number;
      startY: number;
      startValue: number;
      grabOffset: number;
    };
    let drag: Drag | null = null;

    const xfadeAt = (x: number) =>
      (CROSSFADER.A.x - x) / (CROSSFADER.A.x - CROSSFADER.B.x);

    const onDown = (e: PointerEvent) => {
      if (onControl(e) || !dj.entered || drag) return;
      const target = pick(e);
      if (!target) return;
      e.preventDefault();
      const d: Drag = {
        id: e.pointerId,
        target,
        angle: 0,
        turn: 0,
        scratching: false,
        startX: e.clientX,
        startY: e.clientY,
        startValue: 0,
        grabOffset: 0,
      };
      if (target.kind === "record") {
        d.angle = angleOn(e, target.deck) ?? 0;
        holdDeck(target.deck);
      } else if (target.kind === "crossfader") {
        const p = onPlane(e, CROSSFADER.A.y);
        d.grabOffset = p ? dj.xfade - xfadeAt(p.x) : 0;
      } else if (target.kind === "filter") {
        d.startValue = dj.filter;
      } else {
        pad(target.pad);
        return;
      }
      drag = d;
      canvas.style.cursor = "grabbing";
    };

    const onMove = (e: PointerEvent) => {
      if (!drag) {
        // Show what can be played under the pointer.
        if (e.pointerType === "mouse" && dj.entered && !onControl(e)) {
          const t = pick(e);
          let cursor = "";
          if (t) cursor = t.kind === "pad" ? "pointer" : "grab";
          canvas.style.cursor = cursor;
        }
        return;
      }
      if (e.pointerId !== drag.id) return;
      const t = drag.target;
      if (t.kind === "record") {
        const a = angleOn(e, t.deck);
        if (a === null) return;
        let da = a - drag.angle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        drag.angle = a;
        drag.turn += da;
        if (!drag.scratching && Math.abs(drag.turn) > SCRATCH_START)
          drag.scratching = true;
        if (drag.scratching) scratchDeck(t.deck, drag.turn);
      } else if (t.kind === "crossfader") {
        const p = onPlane(e, CROSSFADER.A.y);
        if (p) setCrossfade(xfadeAt(p.x) + drag.grabOffset);
      } else if (t.kind === "filter") {
        const moved =
          (drag.startY - e.clientY + (e.clientX - drag.startX) * 0.5) /
          FILTER_DRAG;
        setFilter(drag.startValue + 2 * moved);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.target.kind === "record") releaseDeck(drag.target.deck);
      drag = null;
      canvas.style.cursor = "";
    };

    const typing = (e: KeyboardEvent) =>
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select");
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e) || !dj.entered) return;
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        if (!e.repeat) pad(Number(digit[1]) as PadId);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) togglePlay();
      } else if (e.code === "KeyD") {
        e.preventDefault();
        if (!e.repeat) drop();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        // ← towards the deck on the left of the screen.
        const a = new Vector3().copy(CROSSFADER.A).project(camera).x;
        const b = new Vector3().copy(CROSSFADER.B).project(camera).x;
        const left = e.code === "ArrowLeft";
        const towardsB = left === b < a;
        setCrossfade(dj.xfade + (towardsB ? 1 : -1) * KEY_STEP.xfade);
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        setFilter(
          dj.filter + (e.code === "ArrowUp" ? 1 : -1) * KEY_STEP.filter,
        );
      }
    };
    // Leaving the page lets go of everything.
    const onBlur = () => {
      if (drag?.target.kind === "record") releaseDeck(drag.target.deck);
      drag = null;
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", onBlur);
    return () => {
      canvas.style.touchAction = touchWas;
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onBlur);
    };
  }, [camera, gl]);

  return null;
};
