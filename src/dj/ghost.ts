// The ghost look of both gold hands: see-through, lit from within in gold,
// with a soft glowing rim where the surface turns away from you. The colour
// is kept mid-bright so the tone curve keeps it saturated instead of white.
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Mesh,
  type Object3D,
} from "three";

/** How the ghost is made of its colour. */
const LOOK = { base: 0.55, body: 0.3, rim: 1.1, opacity: 0.92 };

export const ghostMaterial = (hex: string, glowHex = hex) => {
  const c = new Color(hex);
  const rim = new Color(glowHex).multiplyScalar(LOOK.rim);
  const m = new MeshStandardMaterial({
    color: c.clone().multiplyScalar(LOOK.base),
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: LOOK.opacity,
    depthWrite: false,
    emissive: c.clone().multiplyScalar(LOOK.body),
    side: DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    // eslint-disable-next-line no-param-reassign
    shader.uniforms.uRim = { value: rim };
    // eslint-disable-next-line no-param-reassign
    shader.fragmentShader = `uniform vec3 uRim;\n${shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      float ghostRim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      totalEmissiveRadiance += uRim * pow(ghostRim, 2.2);`,
    )}`;
  };
  m.customProgramCacheKey = () => "dj-ghost";
  return m;
};

const depthOnly = new MeshBasicMaterial({
  colorWrite: false,
  side: DoubleSide,
});

/**
 * Dresses a hand's poses in the ghost look. A depth-only copy drawn first
 * means only the hand's outer surface shows (no overlapping insides).
 */
export const dressGhost = (root: Object3D, look: MeshStandardMaterial) => {
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });
  meshes.forEach((mesh) => {
    const depth = mesh.clone();
    depth.material = depthOnly;
    depth.renderOrder = 4;
    mesh.add(depth);
    depth.position.set(0, 0, 0);
    depth.quaternion.identity();
    depth.scale.set(1, 1, 1);
    /* eslint-disable no-param-reassign */
    mesh.material = look;
    mesh.renderOrder = 5;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    /* eslint-enable no-param-reassign */
  });
};
