import { COMMON_NOISE_GLSL } from "./commonNoise.glsl.js";

export const GOLDEN_DUST_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

${COMMON_NOISE_GLSL}

layout(location = 0) in vec4 aParticleData; // x: uAngle, y: vAngle, z: radialShell, w: seed

uniform mat4 uViewMatrix;
uniform mat4 uProjMatrix;
uniform float uTime;
uniform float uPulsePhase;
uniform float uCoalescence;
uniform float uFocalDistance;
uniform float uAperture;
uniform float uViewportHeight;
uniform float uMajorRadius;
uniform float uMinorRadius;

out float vCoc;
out float vSignedDefocus;
out float vSparkle;
out float vIsBokehOrb;
out vec3 vBaseColor;
out vec2 vScreenOffset;
out float vEnergyWeight;

/**
 * Multi-scale Arnold-Beltrami-Childress (ABC) divergence-free 3D vortical flow.
 */
vec3 evaluateBeltramiVortex(vec3 p, float t) {
  vec3 q1 = p * 0.48 + vec3(t * 0.21, -t * 0.17, t * 0.14);
  vec3 v1 = vec3(
    sin(q1.z) + 0.85 * cos(q1.y),
    sin(q1.x) + 0.92 * cos(q1.z),
    sin(q1.y) + 0.78 * cos(q1.x)
  );

  vec3 q2 = p * 1.15 - vec3(t * 0.33, t * 0.27, -t * 0.19);
  vec3 v2 = vec3(
    cos(q2.y) - 0.65 * sin(q2.z),
    cos(q2.z) - 0.72 * sin(q2.x),
    cos(q2.x) - 0.68 * sin(q2.y)
  );

  return v1 * 0.88 + v2 * 0.38;
}

void main() {
  float u0 = aParticleData.x;
  float v0 = aParticleData.y;
  float shellRaw = aParticleData.z;
  float seed = aParticleData.w;

  // 92% pure 24K golden dust, 8% bioluminescent micro-sparks
  float isMicroSpark = step(shellRaw, -0.85);
  float shell = abs(shellRaw);

  float speedScale = mix(0.18 + 0.16 * fract(seed * 17.3), 0.48 + 0.28 * fract(seed * 31.7), isMicroSpark);
  float windingQ = (fract(seed * 7.0) < 0.5) ? 1.0 : -1.0;

  float u = u0 + uTime * speedScale + seed * TWO_PI;
  float v = v0 + uTime * speedScale * windingQ * 1.25 - seed * 4.1;

  // Coalesced torus position: golden dust streams weave around the torus surface,
  // through the central eye, and in an atmospheric halo just outside the minor radius
  float normalizedShell = clamp(shell * 0.48, 0.12, 1.55);
  float shellRadius = uMinorRadius * (0.28 + 0.84 * normalizedShell);
  float knotRipple = 0.12 * sin(u * 3.0 + v * 2.0 - uPulsePhase * TWO_PI);
  float rEff = shellRadius + knotRipple;

  float cosU = cos(u);
  float sinU = sin(u);
  float cosV = cos(v);
  float sinV = sin(v);

  float ringR = uMajorRadius + rEff * cosV;
  vec3 torusPos = vec3(
    ringR * cosU,
    rEff * sinV,
    ringR * sinU
  );

  vec3 orbitalDrift = evaluateBeltramiVortex(torusPos * 0.62 + vec3(seed * 9.2), uTime * 0.48);
  float outerHaloFactor = smoothstep(1.25, 2.8, shell);
  vec3 coalescedPos = torusPos + orbitalDrift * (0.14 + 0.68 * outerHaloFactor);

  // Dispersed dark-void vortex position
  float voidAngle = u0 + uTime * (0.12 + 0.08 * sin(seed * 19.0)) + shell * 1.1;
  float voidRadius = 1.8 + 6.5 * pow(fract(seed * 3.71 + shell * 0.31), 0.72);
  float voidHeight = (fract(seed * 11.3) - 0.5) * 7.8 + 1.8 * sin(voidAngle * 1.5 - uTime * 0.25);

  vec3 voidBase = vec3(
    voidRadius * cos(voidAngle),
    voidHeight,
    voidRadius * sin(voidAngle)
  );
  vec3 voidVortex = voidBase + evaluateBeltramiVortex(voidBase * 0.38, uTime * 0.42) * 1.45;

  float maxCoalesceForShell = mix(1.0, 0.68, outerHaloFactor);
  float localCoalesce = smoothstep(0.0, 1.0, uCoalescence) * maxCoalesceForShell;
  vec3 worldPos = mix(voidVortex, coalescedPos, localCoalesce);

  vec4 viewPos = uViewMatrix * vec4(worldPos, 1.0);
  vec4 clipPos = uProjMatrix * viewPos;
  gl_Position = clipPos;

  float viewDepth = max(0.25, -viewPos.z);
  float signedDefocus = (viewDepth - uFocalDistance) / max(viewDepth, 0.25);
  float absDefocus = abs(signedDefocus);

  // Physical aperture scaling (f/1.2 produces large macro bokeh; f/16 produces sharp dust)
  float apertureStrength = clamp((2.15 / max(uAperture, 1.0)) - 0.12, 0.0, 1.80);
  float cocMetric = clamp(absDefocus * apertureStrength * 2.25, 0.0, 1.0);

  // Stratify the 1,000,000 particles into 3 physical optical tiers:
  // 1. Fine volumetric golden dust & micro-sparks (998,850 particles): 1.0px - 2.2px
  // 2. Medium golden bokeh glints (900 particles): expands up to 15px when out of focus
  // 3. Hero macro bokeh aperture rings (250 particles): expands up to 48px when out of focus
  float tierRand = fract(seed * 4999.0 + u0 * 0.15915);
  float isMediumBokeh = step(0.99885, tierRand) * step(tierRand, 0.99975) * (1.0 - isMicroSpark);
  float isHeroBokeh   = step(0.99975, tierRand) * (1.0 - isMicroSpark);
  float isAnyBokeh    = clamp(isMediumBokeh + isHeroBokeh, 0.0, 1.0);

  float viewportScale = uViewportHeight / 900.0;
  float basePixelSize = (1.05 + 0.60 * fract(seed * 43.0)) * viewportScale;

  float maxDefocusExpansion = 1.15 * viewportScale;
  if (isMediumBokeh > 0.5) {
    basePixelSize = 1.8 * viewportScale;
    maxDefocusExpansion = (10.0 + 9.0 * fract(seed * 97.0)) * viewportScale;
  } else if (isHeroBokeh > 0.5) {
    basePixelSize = 2.4 * viewportScale;
    maxDefocusExpansion = (22.0 + 28.0 * fract(seed * 131.0)) * viewportScale;
  }

  float finalPointSize = clamp(basePixelSize + cocMetric * maxDefocusExpansion, 1.0, 52.0);
  gl_PointSize = finalPointSize;

  // Twinkle / scintillation modulation
  float twinklePhase = uTime * (1.8 + 2.8 * fract(seed * 29.0)) + seed * 67.0;
  float rawSine = 0.5 + 0.5 * sin(twinklePhase);
  float sparkle = mix(0.32 + 0.68 * pow(rawSine, 3.0), 0.75 + 0.25 * rawSine, isAnyBokeh);

  // Calibrated radiometric flux per particle:
  // Fine dust forms a delicate golden shimmer; Medium & Hero bokeh orbs form translucent golden aperture rings
  float baseRadiometricWeight = 0.0032 * (0.38 + 2.2 * pow(rawSine, 5.0));
  if (isMediumBokeh > 0.5) {
    baseRadiometricWeight = mix(0.34, 0.18, cocMetric);
  } else if (isHeroBokeh > 0.5) {
    baseRadiometricWeight = mix(0.48, 0.28, cocMetric);
  }

  // Pure 24K gold & warm amber for golden dust; electric cyan & magenta for micro-sparks
  vec3 warmGoldCore = vec3(1.88, 1.30, 0.10);
  vec3 richAmber    = vec3(1.65, 0.90, 0.05);
  vec3 goldColor    = mix(richAmber, warmGoldCore, fract(seed * 53.0));

  vec3 sparkColor = mix(
    vec3(0.00, 0.95, 1.75),
    vec3(1.75, 0.03, 0.82),
    step(0.48, fract(seed * 89.0))
  );

  vCoc = cocMetric;
  vSignedDefocus = signedDefocus;
  vSparkle = sparkle;
  vIsBokehOrb = isAnyBokeh;
  vBaseColor = mix(goldColor, sparkColor, isMicroSpark);
  vScreenOffset = clipPos.xy / max(clipPos.w, 0.001);
  vEnergyWeight = baseRadiometricWeight;
}
`;

export const GOLDEN_DUST_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in float vCoc;
in float vSignedDefocus;
in float vSparkle;
in float vIsBokehOrb;
in vec3 vBaseColor;
in vec2 vScreenOffset;
in float vEnergyWeight;

layout(location = 0) out vec4 fragColor;

void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;

  // Optical cat's-eye mechanical vignetting near viewport edges for out-of-focus bokeh discs
  vec2 lensShift = vScreenOffset * (0.26 * vCoc);
  float rPrimary = length(uv);
  float rCatsEye = length(uv - lensShift);
  float r = max(rPrimary, mix(rPrimary, rCatsEye, 0.62 * vCoc));

  if (r > 1.0) {
    discard;
  }

  // Sharp focus profile (airy disc pinpoint core) vs out-of-focus translucent bokeh aperture ring
  float airyCore = exp(-r * r * 5.5);
  float apertureDisc = smoothstep(1.0, 0.82, r);
  // Translucent center (0.22) with bright optical aperture ring (0.85) so fibers show through the bokeh disc
  float bokehRing = 0.22 + 0.85 * smoothstep(0.42, 0.88, r);
  float bokehProfile = apertureDisc * bokehRing;

  float discIntensity = mix(airyCore, bokehProfile, smoothstep(0.08, 0.48, vCoc));

  // Subtle axial chromatic fringe on out-of-focus bokeh rings
  vec3 chromaTint = vec3(1.0);
  if (vCoc > 0.20) {
    float edgeBand = smoothstep(0.60, 0.92, r);
    chromaTint = (vSignedDefocus > 0.0)
      ? mix(vec3(1.0), vec3(1.15, 0.96, 0.72), edgeBand)
      : mix(vec3(1.0), vec3(0.88, 1.02, 1.15), edgeBand);
  }

  float lum = discIntensity * vEnergyWeight * vSparkle;
  if (lum < 0.0003) {
    discard;
  }

  vec3 finalRgb = vBaseColor * chromaTint * lum;
  float occlusionAlpha = clamp(lum * mix(0.20, 0.58, vIsBokehOrb), 0.0, 0.68);
  fragColor = vec4(finalRgb, occlusionAlpha);
}
`;
