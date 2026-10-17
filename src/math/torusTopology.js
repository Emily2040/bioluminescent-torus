/**
 * @fileoverview Mathematical topology generators for the interlocking Villarceau &
 * (p,q) torus-knot fiber-optic bundles and the 1,000,000 golden dust particle field.
 */

export const TORUS_MAJOR_RADIUS = 3.25;
export const TORUS_MINOR_RADIUS = 1.18;
export const FIBER_STRAND_COUNT = 2048;
export const FIBER_SEGMENTS_PER_STRAND = 128;
export const GOLDEN_DUST_COUNT = 1_000_000;

/**
 * Deterministic Mulberry32 PRNG so geometry and particle layouts are 100% reproducible.
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRandom(seed = 0x8fa319d5) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates template ribbon strip geometry and per-instance attributes for 2,048
 * continuous 128-segment fiber-optic strands (262,144 glowing tubular segments).
 */
export function createFiberStrandBuffers() {
  const segments = FIBER_SEGMENTS_PER_STRAND;
  const verticesPerStrand = (segments + 1) * 2;
  // Template vertex attribute: [sCoord (0..1), side (-1 or +1)]
  const templateVertices = new Float32Array(verticesPerStrand * 2);

  let ptr = 0;
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    templateVertices[ptr++] = s;
    templateVertices[ptr++] = -1.0;
    templateVertices[ptr++] = s;
    templateVertices[ptr++] = +1.0;
  }

  // Per-instance attributes:
  // aStrandParams: [uOffset, vOffset, familyType, radialLayer]
  // aStrandMeta:   [strandSeed, thicknessScale, colorBias, captureOrder]
  const strandParams = new Float32Array(FIBER_STRAND_COUNT * 4);
  const strandMeta = new Float32Array(FIBER_STRAND_COUNT * 4);

  const rand = createSeededRandom(0x4210f3a9);
  const TWO_PI = Math.PI * 2.0;
  const PHI_INV = 0.6180339887498949;

  for (let i = 0; i < FIBER_STRAND_COUNT; i++) {
    const tNorm = i / FIBER_STRAND_COUNT;
    const goldenU = ((i * PHI_INV) % 1.0) * TWO_PI;
    const vOffset = rand() * TWO_PI;

    // Distribute across 4 interlocking topological families:
    // 0: Villarceau Circle Family A (p=1, q=1 slanted loxodromic rings)
    // 1: Villarceau Circle Family B (p=1, q=-1 counter-slanted rings)
    // 2: (3, 5) Harmonic Torus Knot core ribbons
    // 3: (5, 8) & (7, 11) Outer filigree geodesic weave
    let familyType = 0.0;
    let radialLayer = 0.0;
    let thicknessScale = 1.0;

    if (i < 768) {
      familyType = 0.0;
      radialLayer = (rand() - 0.5) * 0.55;
      thicknessScale = 0.78 + rand() * 0.55;
    } else if (i < 1408) {
      familyType = 1.0;
      radialLayer = (rand() - 0.5) * 0.65;
      thicknessScale = 0.72 + rand() * 0.52;
    } else if (i < 1792) {
      familyType = 2.0;
      // Inner high-luminance core braids
      radialLayer = -0.58 + (rand() - 0.5) * 0.35;
      thicknessScale = 0.95 + rand() * 0.65;
    } else {
      familyType = 3.0;
      // Outer gossamer corona filaments
      radialLayer = 0.42 + rand() * 0.62;
      thicknessScale = 0.58 + rand() * 0.42;
    }

    const base4 = i * 4;
    strandParams[base4 + 0] = goldenU;
    strandParams[base4 + 1] = vOffset;
    strandParams[base4 + 2] = familyType;
    strandParams[base4 + 3] = radialLayer;

    strandMeta[base4 + 0] = rand() * 100.0;
    strandMeta[base4 + 1] = thicknessScale;
    strandMeta[base4 + 2] = (tNorm * 0.65 + rand() * 0.35) % 1.0;
    strandMeta[base4 + 3] = Math.min(1.0, Math.max(0.0, 0.5 * (radialLayer + 1.0) * 0.7 + rand() * 0.3));
  }

  return {
    templateVertices,
    verticesPerStrand,
    strandCount: FIBER_STRAND_COUNT,
    segmentCount: FIBER_STRAND_COUNT * FIBER_SEGMENTS_PER_STRAND,
    strandParams,
    strandMeta,
  };
}

/**
 * Generates deterministic GPU attribute buffer for 1,000,000 golden dust & micro-spark particles.
 * Layout per particle (vec4):
 *   x: uAngle (0..2pi)
 *   y: vAngle (0..2pi)
 *   z: radialShell (-1.5 .. +2.5, encoding core dust vs outer void bokeh orbs)
 *   w: packedSeed (0..1 fractional seed + integer tier flag)
 */
export function createGoldenDustBuffers() {
  const count = GOLDEN_DUST_COUNT;
  const particleData = new Float32Array(count * 4);
  const TWO_PI = Math.PI * 2.0;

  // 3D Plastic constant (Kronecker low-discrepancy sequence) for fast, uniform 1M distribution
  const g1 = 0.8191725133961644;
  const g2 = 0.6710436067037893;
  const g3 = 0.5497004779019703;

  let s1 = 0.1379;
  let s2 = 0.4921;
  let s3 = 0.7813;

  for (let i = 0; i < count; i++) {
    s1 = (s1 + g1) % 1.0;
    s2 = (s2 + g2) % 1.0;
    s3 = (s3 + g3) % 1.0;

    const base4 = i * 4;
    const uAngle = s1 * TWO_PI;
    const vAngle = s2 * TWO_PI;

    // Stratify into:
    // - 55% close toroidal flux dust (radialShell in [0.15, 1.25])
    // - 30% wide void macro bokeh golden dust (radialShell in [1.25, 2.85])
    // - 15% high-energy bioluminescent micro-sparks (radialShell < 0)
    let radialShell;
    if (i % 20 < 3) {
      // Negative radialShell signals high-energy electric/magenta/gold micro-spark in shader
      radialShell = -(0.25 + s3 * 1.15);
    } else if (i % 20 < 14) {
      radialShell = 0.18 + s3 * 1.12;
    } else {
      // Outer macro bokeh dust clouds that pass very close to the camera lens
      radialShell = 1.25 + s3 * s3 * 1.95;
    }

    const seedValue = ((i * 0.38196601125) % 1.0) * 0.999 + 0.0005;

    particleData[base4 + 0] = uAngle;
    particleData[base4 + 1] = vAngle;
    particleData[base4 + 2] = radialShell;
    particleData[base4 + 3] = seedValue;
  }

  return {
    count,
    particleData,
  };
}

/**
 * Evaluates the smooth choreographed coalescence curve from normalized timeline phase [0..1].
 * Phases:
 *   0.00 - 0.14 : 01 Void Swirl (dispersed bioluminescent filaments & golden dust in dark void)
 *   0.14 - 0.34 : 02 Magnetic Capture (vortex tightens, inner braids form first)
 *   0.34 - 0.52 : 03 Villarceau Weave (interlocking 3D torus geometry locks into place)
 *   0.52 - 0.78 : 04 Harmonic Resonance (full 3D torus pulsing with electric blue & magenta waves)
 *   0.78 - 1.00 : 05 Slow-Mo Dispersal (outer shells gently unwind back into the void)
 *
 * @param {number} cyclePhase Normalized phase in [0, 1]
 * @returns {{ coalescence: number, pulseIntensity: number, vortexCurl: number, phaseIndex: number, phaseName: string }}
 */
export function evaluateChoreographyPhase(cyclePhase) {
  const p = ((cyclePhase % 1.0) + 1.0) % 1.0;

  const smoothstep = (edge0, edge1, x) => {
    const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
  };

  // Rise from 0.04 in Void Swirl to 1.00 in Harmonic Resonance, then release back to 0.04
  const rise = smoothstep(0.09, 0.48, p);
  const fall = 1.0 - smoothstep(0.76, 0.97, p);
  const coalescence = 0.04 + 0.96 * rise * fall;

  // Harmonic wave intensity peaks during Villarceau Weave & Harmonic Resonance
  const pulseIntensity = 0.45 + 0.55 * smoothstep(0.20, 0.55, p) * (1.0 - 0.5 * smoothstep(0.82, 0.99, p));
  const vortexCurl = 1.0 - 0.72 * coalescence;

  let phaseIndex = 0;
  let phaseName = "Void Swirl";
  if (p >= 0.14 && p < 0.34) {
    phaseIndex = 1;
    phaseName = "Magnetic Capture";
  } else if (p >= 0.34 && p < 0.52) {
    phaseIndex = 2;
    phaseName = "Villarceau Weave";
  } else if (p >= 0.52 && p < 0.78) {
    phaseIndex = 3;
    phaseName = "Harmonic Resonance";
  } else if (p >= 0.78) {
    phaseIndex = 4;
    phaseName = "Slow-Mo Dispersal";
  }

  return {
    coalescence,
    pulseIntensity,
    vortexCurl,
    phaseIndex,
    phaseName,
  };
}

/**
 * Ray-marches the torus signed distance field from a normalized screen click (ndcX, ndcY)
 * to compute the exact optical focal distance for click-to-focus.
 */
export function raycastTorusFocalDistance(ndcX, ndcY, cameraPos, cameraTarget, fovRadians, aspect) {
  // Compute camera basis vectors
  const fx = cameraTarget[0] - cameraPos[0];
  const fy = cameraTarget[1] - cameraPos[1];
  const fz = cameraTarget[2] - cameraPos[2];
  const fLen = Math.hypot(fx, fy, fz) || 1.0;
  const forward = [fx / fLen, fy / fLen, fz / fLen];

  const upRef = [0, 1, 0];
  let rx = forward[1] * upRef[2] - forward[2] * upRef[1];
  let ry = forward[2] * upRef[0] - forward[0] * upRef[2];
  let rz = forward[0] * upRef[1] - forward[1] * upRef[0];
  const rLen = Math.hypot(rx, ry, rz) || 1.0;
  const right = [rx / rLen, ry / rLen, rz / rLen];

  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];

  const tanHalfFov = Math.tan(fovRadians * 0.5);
  const dx = forward[0] + ndcX * aspect * tanHalfFov * right[0] + ndcY * tanHalfFov * up[0];
  const dy = forward[1] + ndcX * aspect * tanHalfFov * right[1] + ndcY * tanHalfFov * up[1];
  const dz = forward[2] + ndcX * aspect * tanHalfFov * right[2] + ndcY * tanHalfFov * up[2];
  const dLen = Math.hypot(dx, dy, dz) || 1.0;
  const rayDir = [dx / dLen, dy / dLen, dz / dLen];

  // Sphere-trace the torus SDF: sdf(p) = length(vec2(length(p.xz) - R, p.y)) - r
  let t = 0.8;
  let bestT = fLen;
  let minSdf = 999.0;

  for (let step = 0; step < 48; step++) {
    const px = cameraPos[0] + rayDir[0] * t;
    const py = cameraPos[1] + rayDir[1] * t;
    const pz = cameraPos[2] + rayDir[2] * t;

    const qx = Math.hypot(px, pz) - TORUS_MAJOR_RADIUS;
    const sdf = Math.hypot(qx, py) - TORUS_MINOR_RADIUS * 1.15;

    if (sdf < minSdf) {
      minSdf = sdf;
      bestT = t;
    }
    if (sdf < 0.05) {
      bestT = t;
      break;
    }
    t += Math.max(0.12, sdf * 0.85);
    if (t > 16.0) break;
  }

  // Convert ray distance t to view-space Z depth along camera forward vector
  const viewDot = rayDir[0] * forward[0] + rayDir[1] * forward[1] + rayDir[2] * forward[2];
  const focalDepth = Math.max(1.2, Math.min(12.0, bestT * viewDot));
  return focalDepth;
}
