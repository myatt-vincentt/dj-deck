// While a routine runs, the part of the booth its cue needs glows gold: the
// right deck's record (scratch, brake), a pad (fill, echo, riser, vocal
// chop), the mixer (the drop), an end or the middle of the crossfader's
// slot, or the filter knob. A soft ring that breathes with the beat; in
// Play it shows from two beats before the cue is due.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import {
  COLOURS,
  CROSSFADER,
  FILTER_KNOB,
  PAD_POS,
  RECORD,
  RECORD_RADIUS,
} from "./layout";
import type { CueKind } from "./routines";
import { clockNow, dj } from "./state";

/** Each cue's ring: centre, inner and outer radius (m). */
const RINGS: Record<CueKind, { at: Vector3; inner: number; outer: number }> =
  (() => {
    const lift = (v: Vector3, y: number) => v.clone().setY(v.y + y);
    const record = {
      at: lift(RECORD.B, 0.005),
      inner: RECORD_RADIUS + 0.006,
      outer: RECORD_RADIUS + 0.02,
    };
    const pad = (k: number) => ({
      at: lift(PAD_POS[k], 0.009),
      inner: 0.036,
      outer: 0.046,
    });
    const xf = (v: Vector3) => ({
      at: lift(v, 0.016),
      inner: 0.015,
      outer: 0.022,
    });
    const knob = {
      at: lift(FILTER_KNOB.center, 0.022),
      inner: 0.03,
      outer: 0.038,
    };
    return {
      scratch: record,
      brake: record,
      fill: pad(0),
      echo: pad(1),
      riser: pad(2),
      chop: pad(3),
      drop: { at: new Vector3(0, 1.114, -0.4), inner: 0.21, outer: 0.228 },
      xfadeA: xf(CROSSFADER.A),
      xfadeB: xf(CROSSFADER.B),
      xfadeMid: xf(CROSSFADER.A.clone().lerp(CROSSFADER.B, 0.5)),
      filterLow: knob,
      filterHigh: knob,
      filterOpen: knob,
    };
  })();

/** Play shows the glow this many beats before a cue. */
const AHEAD = 2;

export const CueGlow = () => {
  const ring = useMemo(() => {
    const m = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(COLOURS.ghost) },
        uAlpha: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(uColor * 2.5, uAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const mesh = new Mesh(new RingGeometry(1, 1.2, 96, 1), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 8;
    mesh.visible = false;
    return { mesh, m, kind: null as CueKind | null, shown: 0 };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = dj.session;
    let want = 0;
    let kind: CueKind | null = null;
    if (s) {
      const now = clockNow();
      const i = s.current(now);
      const c = s.routine.cues[i];
      if (c) {
        kind = c.kind;
        want = s.mode === "learn" || s.timeOf(i) - now < AHEAD * s.spb ? 1 : 0;
      }
    }
    if (kind && kind !== ring.kind) {
      const r = RINGS[kind];
      ring.kind = kind;
      ring.mesh.position.copy(r.at);
      ring.mesh.geometry.dispose();
      ring.mesh.geometry = new RingGeometry(r.inner, r.outer, 96, 1);
    }
    ring.shown += (want - ring.shown) * (1 - Math.exp(-dt / 0.12));
    ring.mesh.visible = ring.shown > 0.01;
    const beat = Math.max(0, dj.beat);
    const pulse = 0.6 + 0.4 * (1 - (beat % 1)) ** 2;
    ring.m.uniforms.uAlpha.value = ring.shown * pulse * 0.9;
  });

  return <primitive object={ring.mesh} />;
};
