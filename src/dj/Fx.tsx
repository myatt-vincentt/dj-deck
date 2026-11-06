// The light show, drawn in code around the booth:
//   - at night two club beams (magenta and teal) fall from the ceiling onto
//     the decks, swaying gently with the bar and brightening with the kick
//   - at night a soft magenta glow on the floor in front of the booth, rings
//     round the speaker cones that pump with the kick, and a ring that
//     sweeps out across the floor on every bar (and on a drop's landing)
//   - gold streaks on a record while you scratch or brake it
//   - a soft shadow under the booth and the speakers (day and night)
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from "three";

import { boothLook } from "./Booth";
import { BEAMS, BOOTH, COLOURS, RECORD, SPEAKER } from "./layout";
import { DECKS, type DeckId } from "./music";
import { dj } from "./state";

/** The beams: their radius at the top and at the booth (m), and how bright. */
const BEAM = {
  top: 0.03,
  bottom: 0.36,
  alpha: 0.8,
  pulse: 0.35,
  sway: 0.05,
  gain: 4.5,
};
/** The floor glow and the bar ring. */
const FLOOR = { alpha: 0.42, pulse: 0.35, ring: 0.5, ringTime: 1.1 };
/** The speaker rings: radii (m) and how far in front of the cone. */
const HALOS = [
  { inner: 0.19, outer: 0.21, out: 0.03 },
  { inner: 0.245, outer: 0.26, out: 0.06 },
];
/** The scratch streaks: their rings on the record (inner, outer radius, m) and their arcs (degrees). */
const STREAKS = [
  { inner: 0.124, outer: 0.134, from: 30, to: 100 },
  { inner: 0.1, outer: 0.108, from: 34, to: 85 },
  { inner: 0.14, outer: 0.147, from: 32, to: 72 },
  { inner: 0.068, outer: 0.074, from: 42, to: 88 },
];

/** Where the scratch hand sits on a record (radians, counter-clockwise from +x seen from above), and how far the streaks turn with it. */
const STREAK_AT = 1.4;
const STREAK_TURN = 0.9;

const fadeVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const output = /* glsl */ `
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
`;

/** An additive glow material; `shape` sets its alpha from vUv. */
const glow = (colour: string, shape: string, extra = "") =>
  new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(colour) },
      uAlpha: { value: 0 },
    },
    vertexShader: fadeVert,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      ${extra}
      varying vec2 vUv;
      void main() {
        float a = ${shape};
        gl_FragColor = vec4(uColor, a * uAlpha);
        ${output}
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });

/** A beam: an open cone, fading down its length and to its edges. */
const beamVert = /* glsl */ `
  varying float vAlong;
  varying float vFacing;
  varying float vNear;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    vAlong = uv.y;
    // Fades out right in front of the camera (a beam you stand in is a haze).
    vNear = smoothstep(0.5, 1.6, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const beamFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vAlong;
  varying float vFacing;
  varying float vNear;
  void main() {
    // uv.y: 1 at the lamp, 0 at the booth.
    float along = smoothstep(0.0, 0.25, vAlong) * mix(0.35, 1.0, vAlong);
    float a = along * pow(vFacing, 1.2) * vNear;
    gl_FragColor = vec4(uColor * ${BEAM.gain.toFixed(2)}, a * uAlpha);
    ${output}
  }
`;

/** An arc of a ring, flat (x, z), from angle a0 to a1 (radians). */
const arcGeometry = (inner: number, outer: number, a0: number, a1: number) => {
  const n = 32;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    pos.push(Math.cos(a) * inner, 0, -Math.sin(a) * inner);
    pos.push(Math.cos(a) * outer, 0, -Math.sin(a) * outer);
    uv.push(t, 0, t, 1);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
};

/** A soft shadow on the floor: dark in the middle of a rounded box, fading out. */
const shadowMaterial = (soft: number) =>
  new ShaderMaterial({
    uniforms: { uAlpha: { value: 0.55 } },
    vertexShader: fadeVert,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        vec2 p = abs(vUv - 0.5) * 2.0;
        vec2 q = max(p - (1.0 - ${soft.toFixed(2)}), 0.0) / ${soft.toFixed(2)};
        float a = 1.0 - smoothstep(0.0, 1.0, length(q));
        gl_FragColor = vec4(0.0, 0.0, 0.0, a * a * uAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const UP = new Vector3(0, 1, 0);

export const Fx = () => {
  const fx = useMemo(() => {
    const group = new Group();

    // Soft shadows under the booth and the speakers.
    const shadows = [
      { w: BOOTH.width + 0.5, d: BOOTH.depth + 0.45, x: 0, z: BOOTH.centerZ },
      { w: 0.7, d: 0.66, x: SPEAKER.L.x, z: -0.32 },
      { w: 0.7, d: 0.66, x: SPEAKER.R.x, z: -0.32 },
    ].map((s) => {
      const m = new Mesh(new PlaneGeometry(s.w, s.d), shadowMaterial(0.5));
      m.rotation.x = -Math.PI / 2;
      m.position.set(s.x, 0.011, s.z);
      m.renderOrder = 1;
      group.add(m);
      return m;
    });

    // The beams.
    const beams = BEAMS.map((b) => {
      const length = b.from.distanceTo(b.to);
      const geo = new CylinderGeometry(
        BEAM.top,
        BEAM.bottom,
        length,
        40,
        1,
        true,
      );
      // Its top at the lamp, pointing down along -y.
      geo.translate(0, -length / 2, 0);
      const m = new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(b.colour) },
          uAlpha: { value: 0 },
        },
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      });
      const mesh = new Mesh(geo, m);
      mesh.position.copy(b.from);
      mesh.renderOrder = 7;
      mesh.frustumCulled = false;
      const dir = b.to.clone().sub(b.from).normalize();
      const base = new Quaternion().setFromUnitVectors(
        new Vector3(0, -1, 0),
        dir,
      );
      // The sway turns the beam about a level axis across it.
      const across = new Vector3().crossVectors(dir, UP).normalize();
      group.add(mesh);
      return { mesh, m, base, across };
    });

    // The floor glow in front of the booth (magenta, fading away from it).
    const floorGlow = new Mesh(
      new PlaneGeometry(3.8, 1.25),
      glow(
        COLOURS.magenta,
        "2.0 * smoothstep(0.0, 0.5, min(vUv.x, 1.0 - vUv.x)) * pow(vUv.y, 1.6)",
      ),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(0, 0.012, BOOTH.front + 0.625);
    floorGlow.renderOrder = 2;
    group.add(floorGlow);

    // A ring sweeping out across the floor on each bar.
    const barRing = new Mesh(
      new RingGeometry(0.97, 1, 96, 1),
      glow(COLOURS.teal, "1.0"),
    );
    barRing.rotation.x = -Math.PI / 2;
    barRing.position.set(0, 0.013, BOOTH.centerZ);
    barRing.renderOrder = 2;
    group.add(barRing);

    // Rings round the speaker cones.
    const halos = (["L", "R"] as const).flatMap((s) => {
      const c = SPEAKER[s];
      // The cones face the audience, turned a little inwards.
      const face = new Vector3(s === "L" ? -0.2 : 0.2, 0, 1).normalize();
      return HALOS.map((h) => {
        const mesh = new Mesh(
          new RingGeometry(h.inner, h.outer, 64, 1),
          glow("#FF73BF", "1.0"),
        );
        mesh.position.copy(c).addScaledVector(face, h.out);
        mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), face);
        mesh.renderOrder = 7;
        group.add(mesh);
        return { mesh, base: 1 };
      });
    });

    // Scratch streaks: a few gold arcs on each record, behind the hand.
    const streaks = Object.fromEntries(
      DECKS.map((d) => {
        const g = new Group();
        g.position.copy(RECORD[d]);
        // Just above the vinyl (the record is 2 mm thick).
        g.position.y += 0.0034;
        const mats = STREAKS.map((s) => {
          const m = glow(
            COLOURS.streak,
            "3.0 * sin(3.14159 * vUv.x) * sin(3.14159 * vUv.y)",
          );
          const mesh = new Mesh(
            arcGeometry(
              s.inner,
              s.outer,
              (s.from * Math.PI) / 180,
              (s.to * Math.PI) / 180,
            ),
            m,
          );
          mesh.renderOrder = 6;
          g.add(mesh);
          return m;
        });
        group.add(g);
        return [d, { g, mats, alpha: 0 }];
      }),
    ) as Record<DeckId, { g: Group; mats: ShaderMaterial[]; alpha: number }>;

    return { group, shadows, beams, floorGlow, barRing, halos, streaks };
  }, []);

  const sway = useMemo(() => new Quaternion(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const n = boothLook.night;
    const lv = dj.levels;
    const perf = performance.now() / 1000;
    const { from, land } = dj.fx.drop;
    const build =
      perf >= from && perf < land
        ? (perf - from) / Math.max(0.1, land - from)
        : 0;
    const flash = perf >= land ? Math.max(0, 1 - (perf - land) / 0.8) : 0;
    const beat = Math.max(0, dj.beat);
    const playing = dj.playing ? 1 : 0;

    // The beams: night only, swaying over two bars.
    fx.beams.forEach((b, i) => {
      const a =
        BEAM.sway * Math.sin((Math.PI * beat) / 4 + i * Math.PI) * playing;
      sway.setFromAxisAngle(b.across, a);
      b.mesh.quaternion.copy(sway).multiply(b.base);
      // eslint-disable-next-line no-param-reassign
      b.m.uniforms.uAlpha.value =
        n * BEAM.alpha * (1 + BEAM.pulse * lv.low + 1.2 * build + 2 * flash);
      // eslint-disable-next-line no-param-reassign
      b.mesh.visible = n > 0.01;
    });

    // The floor glow and the bar ring.
    const fg = fx.floorGlow.material as ShaderMaterial;
    fg.uniforms.uAlpha.value =
      n * FLOOR.alpha * (0.6 + FLOOR.pulse * lv.low + flash);
    fx.floorGlow.visible = n > 0.01;
    const sinceBar = dj.playing ? ((beat % 4) * 60) / dj.transport.bpm : 9;
    const sinceLand = perf - land;
    const ringT =
      sinceLand >= 0 && sinceLand < FLOOR.ringTime * 1.5
        ? sinceLand / 1.5
        : sinceBar;
    const rk = Math.min(1, ringT / FLOOR.ringTime);
    const grow = 1 - (1 - rk) ** 3;
    fx.barRing.scale.setScalar(0.9 + 1.4 * grow);
    const rm = fx.barRing.material as ShaderMaterial;
    const strong = sinceLand >= 0 && sinceLand < FLOOR.ringTime * 1.5 ? 2.5 : 1;
    rm.uniforms.uAlpha.value = n * FLOOR.ring * (1 - rk) * strong * playing;
    fx.barRing.visible = n > 0.01 && rk < 1;
    (rm.uniforms.uColor.value as Color).set(
      Math.floor(beat / 4) % 2 ? COLOURS.magenta : COLOURS.teal,
    );

    // The speaker rings pump with the kick.
    fx.halos.forEach(({ mesh }, i) => {
      const m = mesh.material as ShaderMaterial;
      const k = lv.low;
      mesh.scale.setScalar(1 + 0.06 * k * (i % 2 ? 1.5 : 1));
      m.uniforms.uAlpha.value = n * (0.25 + 0.7 * k + flash) * 0.8;
      // eslint-disable-next-line no-param-reassign
      mesh.visible = n > 0.01;
    });

    // The streaks follow a scratched or braking record, behind the hand.
    DECKS.forEach((d) => {
      const s = fx.streaks[d];
      const deck = dj.decks[d];
      const held = deck.mode === "scratch" || deck.mode === "brake";
      const speed = Math.min(1, Math.abs(deck.rate - (held ? 0 : 1)) * 0.8);
      const want = held ? Math.max(0.25, speed) : 0;
      s.alpha += (want - s.alpha) * (1 - Math.exp(-dt / 0.08));
      s.g.visible = s.alpha > 0.01;
      // The arcs trail the hand (on the DJ's side of the record), turning with it.
      const turn = Math.max(
        -STREAK_TURN,
        Math.min(STREAK_TURN, -dj.scratchAngle[d]),
      );
      s.g.quaternion.setFromAxisAngle(UP, STREAK_AT + turn);
      s.mats.forEach((m) => {
        // eslint-disable-next-line no-param-reassign
        m.uniforms.uAlpha.value = s.alpha * (1.1 + 0.4 * n);
      });
    });
  });

  return <primitive object={fx.group} />;
};
