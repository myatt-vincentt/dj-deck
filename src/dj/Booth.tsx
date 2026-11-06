// The booth: two turntables and a two-channel mixer on a wooden DJ booth,
// with a speaker either side. What moves:
//   - the records turn while the music plays, and follow a scratch or a brake
//   - the crossfader slides, the filter knob turns, and its LED ring lights
//     from the middle towards the pointer
//   - the pads press down when hit and glow while their effect plays
//   - the level meters, the platter rings, the booth's LED strip and the
//     speaker cones pulse with the music
// The booth does not move between views; only the camera does.
import { useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  Group,
  Quaternion,
  RectAreaLight,
  ShaderMaterial,
  SpotLight,
  Vector3,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from "three";

import {
  BEAMS,
  COLOURS,
  CROSSFADER,
  FILTER_KNOB,
  METER,
  PAD_POS,
} from "./layout";
import { dressModel } from "./look";
import { MODELS, useOptionalModel } from "./models";
import { DECKS, type DeckId } from "./music";
import { dj, PADS, type PadId } from "./state";

/** What the rest of the scene reads about the booth's look. */
export const boothLook = {
  /** 0 day … 1 night, eased (as the studio). */
  night: dj.night ? 1 : 0,
};

/** How strongly the glowing parts glow (× their colour), day and night. */
const GLOW = {
  ring: { day: 0.9, night: 1.6 },
  pad: { day: 0.06, night: 0.3 },
  padLit: { day: 2.4, night: 2.8 },
  boothLed: { day: 0.6, night: 2.4 },
  speakerRing: { day: 0.25, night: 1.4 },
  filterCap: { day: 0.3, night: 0.5 },
  led: { day: 2.2, night: 2.6 },
};
/** A pad sinks this far when hit (m), and comes back over this long (s). */
const PAD_PRESS = { depth: 0.0025, time: 0.18 };
/** The speaker cones push out with the kick (m). */
const CONE_PUSH = 0.008;
/** The live lights on the booth at night: the two coloured spots, the booth's front wash. */
const LIGHTS = { spot: 26, spotPulse: 18, wash: { day: 0.6, night: 2.5 } };

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const dayNight = (g: { day: number; night: number }, k: number) =>
  lerp(g.day, g.night, k);

// ---------------------------------------------------------------- the LEDs

/** The meters and the filter ring: dark LEDs that light one by one. */
const ledVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const meterFrag = /* glsl */ `
  uniform vec2 uLevel;      // deck A, deck B (0..1)
  uniform float uGlow;
  uniform vec3 uGreen;
  uniform vec3 uAmber;
  uniform vec3 uRed;
  varying vec3 vWorld;
  void main() {
    // Which LED this is: up the meter from the DJ's side.
    float k = floor((vWorld.z - (${METER.A.z.toFixed(4)})) / ${METER.step.toFixed(4)} + 0.5);
    float level = vWorld.x > 0.0 ? uLevel.x : uLevel.y;
    float lit = step(k + 0.5, level * ${METER.count.toFixed(1)} + 0.5);
    vec3 c = k < 5.5 ? uGreen : (k < 7.5 ? uAmber : uRed);
    vec3 off = vec3(0.03, 0.035, 0.03) + c * 0.03;
    gl_FragColor = vec4(mix(off, c * uGlow, lit), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const ringFrag = /* glsl */ `
  uniform float uTurn;      // the pointer's angle (degrees, clockwise from the top)
  uniform float uGlow;
  uniform vec3 uColor;
  varying vec3 vWorld;
  void main() {
    vec2 d = vWorld.xz - vec2(${FILTER_KNOB.center.x.toFixed(4)}, ${FILTER_KNOB.center.z.toFixed(4)});
    // Clockwise from the top, as the DJ sees it.
    float a = degrees(atan(-d.x, d.y));
    float lo = min(0.0, uTurn) - 2.0;
    float hi = max(0.0, uTurn) + 2.0;
    float lit = step(lo, a) * step(a, hi);
    float centre = 1.0 - step(2.0, abs(a));
    vec3 off = vec3(0.03, 0.035, 0.03);
    vec3 c = mix(off, uColor * uGlow, max(lit, centre * 0.5));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------- the model

type Glowing = { m: MeshStandardMaterial; base: Color };
type Parts = {
  body: Object3D;
  records: Record<DeckId, Object3D | null>;
  recordBase: Record<DeckId, Quaternion>;
  crossfader: Object3D | null;
  filterKnob: Object3D | null;
  pads: (Object3D | null)[];
  padY: number[];
  cones: { o: Object3D; base: Vector3; out: Vector3 }[];
  ring: Record<DeckId, Glowing[]>;
  padGlow: Glowing[][];
  boothLed: Glowing[];
  speakerRing: Glowing[];
  filterCap: Glowing[];
  meter: ShaderMaterial;
  filterRing: ShaderMaterial;
};

const dressBooth = (src: Object3D): Parts => {
  const body = src.clone(true);
  dressModel(body);
  const glowing = new Map<string, Glowing[]>();
  const meter = new ShaderMaterial({
    uniforms: {
      uLevel: { value: [0, 0] },
      uGlow: { value: 1 },
      uGreen: { value: new Color(COLOURS.ledGreen) },
      uAmber: { value: new Color(COLOURS.ledAmber) },
      uRed: { value: new Color(COLOURS.ledRed) },
    },
    vertexShader: ledVert,
    fragmentShader: meterFrag,
  });
  const filterRing = new ShaderMaterial({
    uniforms: {
      uTurn: { value: 0 },
      uGlow: { value: 1 },
      uColor: { value: new Color(COLOURS.filter) },
    },
    vertexShader: ledVert,
    fragmentShader: ringFrag,
  });
  // Every glowing material gets its own copy per part (its glow moves).
  body.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((mt: Material) => {
      const std = mt as MeshStandardMaterial;
      if (std.name === "DJ_MeterLed") return meter;
      if (std.name === "DJ_FilterRingLed") return filterRing;
      if (!std.emissive || std.emissive.getHex() === 0) return std;
      let owner: Object3D | null = mesh;
      while (owner && owner.parent && owner.parent !== body)
        owner = owner.parent;
      const key = `${std.name}|${owner?.name ?? ""}`;
      const m = std.clone();
      const list = glowing.get(key) ?? [];
      list.push({ m, base: std.emissive.clone() });
      glowing.set(key, list);
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    // The LEDs and glowing strips cast no shadows.
    if (mats.some((m) => m.name.includes("Led") || m.name.includes("Ring")))
      mesh.castShadow = false;
  });
  const find = (n: string) => body.getObjectByName(n) ?? null;
  const all = (mat: string, owner?: string) => {
    const out: Glowing[] = [];
    glowing.forEach((v, k) => {
      const [m, o] = k.split("|");
      if (m === mat && (owner === undefined || o === owner)) out.push(...v);
    });
    return out;
  };
  const records = { A: find("Record_A"), B: find("Record_B") };
  const pads = PADS.map((k) => find(`Pad_${k}`));
  const cones = (["L", "R"] as const).flatMap((s) => {
    const o = find(`Speaker_Cone_${s}`);
    if (!o) return [];
    // The cone's axis (its local up) in the booth's frame.
    const out = new Vector3(0, 1, 0).applyQuaternion(o.quaternion);
    return [{ o, base: o.position.clone(), out }];
  });
  const filterKnob = find("Filter_Knob");
  return {
    body,
    records,
    recordBase: {
      A: records.A?.quaternion.clone() ?? new Quaternion(),
      B: records.B?.quaternion.clone() ?? new Quaternion(),
    },
    crossfader: find("Crossfader_Knob"),
    filterKnob,
    pads,
    padY: pads.map((p) => p?.position.y ?? PAD_POS[0].y),
    cones,
    ring: { A: all("DJ_Ring_A"), B: all("DJ_Ring_B") },
    padGlow: PADS.map((k) => all(`DJ_Pad${k}`)),
    boothLed: all("DJ_BoothLed"),
    speakerRing: all("DJ_SpkRing"),
    filterCap: all("DJ_FilterCap"),
    meter,
    filterRing,
  };
};

const UP = new Vector3(0, 1, 0);
const qTmp = new Quaternion();

const glowTo = (list: Glowing[], strength: number) =>
  list.forEach(({ m, base }) => {
    m.emissive.copy(base);
    // eslint-disable-next-line no-param-reassign
    m.emissiveIntensity = strength;
  });

export const Booth = () => {
  const src = useOptionalModel(MODELS.booth);
  const parts = useMemo(() => (src ? dressBooth(src) : null), [src]);

  // The booth's own live lights: two coloured spots at night (where the
  // beams come from) and a warm wash on the booth's front from its LED strip.
  const lights = useMemo(() => {
    const spots = BEAMS.map((b) => {
      const s = new SpotLight(b.colour, 0, 6, (24 * Math.PI) / 180, 0.7, 2);
      s.position.copy(b.from);
      s.target.position.copy(b.to);
      return s;
    });
    const wash = new RectAreaLight("#ffc890", 0, 1.7, 0.05);
    wash.position.set(0, 0.95, 0.06);
    wash.lookAt(0, 0.4, 0.3);
    const group = new Group();
    spots.forEach((s) => group.add(s, s.target));
    group.add(wash);
    return { spots, wash, group };
  }, []);

  const shown = useMemo(() => ({ xfade: dj.xfade, filter: dj.filter }), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    boothLook.night +=
      ((dj.night ? 1 : 0) - boothLook.night) * (1 - Math.exp(-dt / 0.3));
    const n = boothLook.night;
    const perf = performance.now() / 1000;
    const lv = dj.levels;
    const k = 1 - Math.exp(-dt / 0.04);
    shown.xfade += (dj.xfade - shown.xfade) * k;
    shown.filter += (dj.filter - shown.filter) * k;
    // The drop: everything brightens through the build and flashes on landing.
    const { from, land } = dj.fx.drop;
    const build =
      perf >= from && perf < land
        ? (perf - from) / Math.max(0.1, land - from)
        : 0;
    const flash = perf >= land ? Math.max(0, 1 - (perf - land) / 0.8) : 0;
    const boost = 1 + 0.8 * build + 1.5 * flash;

    // The booth's lights.
    lights.spots.forEach((s) => {
      // eslint-disable-next-line no-param-reassign
      s.intensity = n * (LIGHTS.spot + LIGHTS.spotPulse * lv.low) * boost;
    });
    lights.wash.intensity =
      dayNight(LIGHTS.wash, n) * (0.7 + 0.5 * lv.low) * boost;

    if (!parts) return;
    // The records.
    DECKS.forEach((d) => {
      const r = parts.records[d];
      if (!r) return;
      r.quaternion
        .copy(qTmp.setFromAxisAngle(UP, dj.decks[d].angle))
        .multiply(parts.recordBase[d]);
      const playing = Math.min(1, Math.abs(dj.decks[d].rate));
      glowTo(
        parts.ring[d],
        dayNight(GLOW.ring, n) *
          (0.25 + 0.75 * playing) *
          (0.75 + 0.6 * dj.levels[d]) *
          boost,
      );
    });
    // The crossfader and the filter.
    if (parts.crossfader)
      parts.crossfader.position.lerpVectors(
        CROSSFADER.A,
        CROSSFADER.B,
        shown.xfade,
      );
    if (parts.filterKnob) {
      // The knob's pointer: up at the middle, clockwise for the high-pass.
      const yaw = Math.PI - shown.filter * FILTER_KNOB.turn;
      parts.filterKnob.quaternion.setFromAxisAngle(UP, yaw);
    }
    parts.filterRing.uniforms.uTurn.value =
      (shown.filter * FILTER_KNOB.turn * 180) / Math.PI;
    parts.filterRing.uniforms.uGlow.value = dayNight(GLOW.led, n);
    glowTo(
      parts.filterCap,
      dayNight(GLOW.filterCap, n) * (1 + Math.abs(shown.filter)),
    );
    // The meters.
    const mv = parts.meter.uniforms.uLevel.value as number[];
    mv[0] = Math.min(1, dj.levels.A * 1.05);
    mv[1] = Math.min(1, dj.levels.B * 1.05);
    parts.meter.uniforms.uGlow.value = dayNight(GLOW.led, n);
    // The pads.
    PADS.forEach((p: PadId, i) => {
      const o = parts.pads[i];
      const since = perf - dj.fx.pressed[p];
      const press =
        since >= 0 && since < PAD_PRESS.time ? 1 - since / PAD_PRESS.time : 0;
      if (o)
        o.position.y = parts.padY[i] - PAD_PRESS.depth * press * (2 - press);
      const on = perf - dj.fx.pads[p];
      const len = dj.fx.padLength[p];
      const lit =
        on >= 0 && on < len + 0.3
          ? Math.min(1, 1 - Math.max(0, on - len) / 0.3)
          : 0;
      glowTo(
        parts.padGlow[i],
        lerp(
          dayNight(GLOW.pad, n),
          dayNight(GLOW.padLit, n),
          Math.max(lit, press * 0.6),
        ),
      );
    });
    // The booth's LED strip and the speaker rings.
    glowTo(
      parts.boothLed,
      dayNight(GLOW.boothLed, n) * (0.7 + 0.6 * lv.low) * boost,
    );
    glowTo(
      parts.speakerRing,
      dayNight(GLOW.speakerRing, n) * (0.5 + 0.9 * lv.low) * boost,
    );
    // The cones push out with the kick.
    parts.cones.forEach(({ o, base, out }) => {
      o.position.copy(base).addScaledVector(out, CONE_PUSH * lv.low);
    });
  });

  const holder = useMemo(() => new Group(), []);
  useLayoutEffect(() => {
    if (!parts) return undefined;
    holder.add(parts.body);
    holder.add(lights.group);
    return () => {
      holder.remove(parts.body);
      holder.remove(lights.group);
    };
  }, [parts, holder, lights]);

  return <primitive object={holder} />;
};
