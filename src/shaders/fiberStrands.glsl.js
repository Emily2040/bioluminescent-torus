import { COMMON_NOISE_GLSL } from "./commonNoise.glsl.js";

export const FIBER_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

${COMMON_NOISE_GLSL}

layout(location = 0) in vec2 aTemplate;      // x: sCoord [0..1], y: side [-1..+1]
layout(location = 1) in vec4 aStrandParams;  // x: uOffset, y: vOffset, z: familyType, w: radialLayer
layout(location = 2) in vec4 aStrandMeta;    // x: strandSeed, y: thicknessScale, z: colorBias, w: captureOrder

uniform mat4 uViewMatrix;
uniform mat4 uProjMatrix;
uniform vec3 uCameraPos;
uniform float uTime;
uniform float uPulsePhase;
uniform float uCoalescence;
uniform float uFocalDistance;
uniform float uAperture;      // f-stop (1.2 .. 16.0)
uniform float uMajorRadius;
uniform float uMinorRadius;

out float vSCoord;
out float vSide;
out float vCoc;
out float vEnergyScale;
out float vColorBias;
out float vWaveBlue;
out float vWaveMagenta;
out float vInterference;
out float vCaptureAlpha;

vec3 evaluateTorusPoint(float s, vec4 params, vec4 meta, float timeVal) {
  float u0 = params.x;
  float v0 = params.y;
  float family = params.z;
  float layer = params.w;
  float seed = meta.x;

  float p = 1.0;
  float q = 1.0;
  float braidAmp = 0.032;
  float braidFreq = 12.0;

  if (family < 0.5) {
    // Villarceau Family A: (1, 1) slanted geodesic circles
    p = 1.0;
    q = 1.0;
    braidAmp = 0.028;
    braidFreq = 10.0;
  } else if (family < 1.5) {
    // Villarceau Family B: (1, -1) counter-slanted interlocking circles
    p = 1.0;
    q = -1.0;
    braidAmp = 0.028;
    braidFreq = 10.0;
  } else if (family < 2.5) {
    // (2, 3) Harmonic Torus Knot core bundle
    p = 2.0;
    q = 3.0;
    braidAmp = 0.045;
    braidFreq = 16.0;
  } else {
    // (3, -5) Outer Geodesic Filigree Cage
    p = 3.0;
    q = -5.0;
    braidAmp = 0.038;
    braidFreq = 14.0;
  }

  float drift = timeVal * (0.12 + 0.03 * sin(seed));
  float u = u0 + (s * TWO_PI * p) + drift * p;
  float v = v0 + (s * TWO_PI * q) + drift * q;

  float microUndulation = braidAmp * sin(s * TWO_PI * braidFreq + seed * 3.1 + timeVal * 0.8);
  float rMinor = uMinorRadius * (0.88 + 0.28 * layer) + microUndulation;

  float harmonicBreath = 0.028 * sin(u * 3.0 - uPulsePhase * TWO_PI + v * 2.0);
  float rEff = rMinor + harmonicBreath;
  float R = uMajorRadius + 0.03 * cos(v * 2.0 + uPulsePhase * TWO_PI);

  float cosU = cos(u);
  float sinU = sin(u);
  float cosV = cos(v);
  float sinV = sin(v);

  float ringR = R + rEff * cosV;
  return vec3(
    ringR * cosU,
    rEff * sinV,
    ringR * sinU
  );
}

vec3 evaluateVoidSwirlPoint(float s, vec3 torusPos, vec4 params, vec4 meta, float timeVal) {
  float seed = meta.x;
  float u0 = params.x;
  float v0 = params.y;

  // Sweeping abyssal spiral filaments in the dark void
  float spiralAngle = u0 + (s - 0.5) * 4.5 + timeVal * 0.15 + sin(seed) * 2.4;
  float radialReach = 5.6 + 4.4 * sin(seed * 0.73 + s * 2.6) + 1.8 * cos(v0);
  float verticalSweep = (s - 0.5) * 6.8 * sin(u0 * 1.5 + seed) + 2.8 * cos(spiralAngle * 0.7 - timeVal * 0.22);

  vec3 baseSwirl = vec3(
    radialReach * cos(spiralAngle),
    verticalSweep,
    radialReach * sin(spiralAngle)
  );

  vec3 curl = curlNoise3(baseSwirl * 0.20 + vec3(seed * 0.13), timeVal * 0.48);
  return baseSwirl + curl * 1.65;
}

vec3 evaluateBlendedFilament(float s, vec4 params, vec4 meta, float localCoalesce, float timeVal) {
  vec3 pTorus = evaluateTorusPoint(s, params, meta, timeVal);
  vec3 pVoid = evaluateVoidSwirlPoint(s, pTorus, params, meta, timeVal);

  float transitionMid = 4.0 * localCoalesce * (1.0 - localCoalesce);
  float twistAngle = transitionMid * (1.4 + 0.6 * sin(meta.x)) * (1.0 - localCoalesce);
  float c = cos(twistAngle);
  float sn = sin(twistAngle);
  vec3 twistedVoid = vec3(
    pVoid.x * c - pVoid.z * sn,
    pVoid.y * (1.0 - 0.25 * transitionMid),
    pVoid.x * sn + pVoid.z * c
  );

  return mix(twistedVoid, pTorus, localCoalesce);
}

void main() {
  float s = aTemplate.x;
  float side = aTemplate.y;

  float orderOffset = aStrandMeta.w * 0.22;
  float localCoalesce = smoothstep(0.0, 1.0, clamp((uCoalescence * 1.22) - orderOffset, 0.0, 1.0));

  float ds = 0.006;
  vec3 worldPos = evaluateBlendedFilament(s, aStrandParams, aStrandMeta, localCoalesce, uTime);
  vec3 nextPos  = evaluateBlendedFilament(min(1.0, s + ds), aStrandParams, aStrandMeta, localCoalesce, uTime);
  vec3 prevPos  = evaluateBlendedFilament(max(0.0, s - ds), aStrandParams, aStrandMeta, localCoalesce, uTime);

  vec3 tangent = normalize(nextPos - prevPos + vec3(1e-5, 0.0, 0.0));
  vec3 toCam = normalize(uCameraPos - worldPos);
  vec3 ribbonRight = normalize(cross(toCam, tangent) + vec3(0.0, 1e-5, 0.0));

  vec4 viewCenter = uViewMatrix * vec4(worldPos, 1.0);
  float viewDepth = max(0.25, -viewCenter.z);

  float defocusDistance = abs(viewDepth - uFocalDistance);
  float apertureStrength = clamp((2.1 / max(uAperture, 1.0)) - 0.11, 0.0, 1.75);
  float cocNormalized = clamp((defocusDistance / viewDepth) * apertureStrength * 2.0, 0.0, 1.0);

  float taper = sin(s * PI);
  float taperProfile = 0.35 + 0.65 * smoothstep(0.0, 0.14, taper);
  // Crisp thin optical fibers when in focus, widening smoothly when out of focus
  float baseHalfWidth = 0.0062 * aStrandMeta.y * taperProfile;
  float bokehHalfWidth = cocNormalized * 0.042 * (0.7 + 0.3 * aStrandMeta.y);
  float finalHalfWidth = baseHalfWidth + bokehHalfWidth;

  float energyScale = clamp((baseHalfWidth * 1.35) / max(finalHalfWidth, 0.0005), 0.12, 1.0);

  float seed = aStrandMeta.x;
  float spatialAngle = atan(worldPos.z, worldPos.x);
  float poloidalAngle = atan(worldPos.y, length(worldPos.xz) - uMajorRadius);

  // Spatially interleaved rhythmic waves of Electric Blue and Bioluminescent Magenta
  // so distinct blue wave bands and magenta wave bands sweep around the torus without washing to pink
  float spatialWaveA = sin(spatialAngle * 3.0 + poloidalAngle * 2.0 - uPulsePhase * TWO_PI * 2.0);
  float spatialWaveB = sin(spatialAngle * 3.0 - poloidalAngle * 2.0 + uPulsePhase * TWO_PI * 2.0 + 2.4);

  float fiberPulseA = pow(0.5 + 0.5 * sin(s * 18.84955 - uPulsePhase * TWO_PI * 3.0 + seed), 4.0);
  float fiberPulseB = pow(0.5 + 0.5 * sin(s * 12.56637 + uPulsePhase * TWO_PI * 2.0 - seed * 1.3), 4.0);

  float blueEnvelope = smoothstep(-0.15, 0.75, spatialWaveA);
  float magEnvelope  = smoothstep(-0.15, 0.75, spatialWaveB) * (1.0 - 0.55 * blueEnvelope);

  float waveBlue = blueEnvelope * (0.45 + 0.85 * fiberPulseA);
  float waveMagenta = magEnvelope * (0.45 + 0.85 * fiberPulseB);

  // Golden-white constructive interference spark where counter-traveling pulses cross
  float interference = pow(clamp(fiberPulseA * fiberPulseB * smoothstep(0.3, 0.9, spatialWaveA * spatialWaveB + 0.5), 0.0, 1.0), 2.5);

  float pulseSwell = 1.0 + 0.25 * max(waveBlue, waveMagenta);
  vec3 displacedWorld = worldPos + ribbonRight * (side * finalHalfWidth * pulseSwell);

  vSCoord = s;
  vSide = side;
  vCoc = cocNormalized;
  vEnergyScale = energyScale;
  vColorBias = aStrandMeta.z;
  vWaveBlue = waveBlue;
  vWaveMagenta = waveMagenta;
  vInterference = interference;
  vCaptureAlpha = 0.72 + 0.28 * localCoalesce;

  gl_Position = uProjMatrix * uViewMatrix * vec4(displacedWorld, 1.0);
}
`;

export const FIBER_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in float vSCoord;
in float vSide;
in float vCoc;
in float vEnergyScale;
in float vColorBias;
in float vWaveBlue;
in float vWaveMagenta;
in float vInterference;
in float vCaptureAlpha;

uniform float uPulseIntensity;

layout(location = 0) out vec4 fragColor;

void main() {
  float r = abs(vSide);

  // Sharp total-internal-reflection core + cylindrical glass cladding rim
  float sharpCore = exp(-r * r * 18.0);
  float claddingRim = exp(-pow((r - 0.68) * 5.5, 2.0)) * 0.35;
  float sharpSheath = pow(max(0.0, 1.0 - r * r), 2.2) * 0.24;
  float sharpProfile = sharpCore + claddingRim + sharpSheath;

  // Out-of-focus macro bokeh ribbon profile
  float bokehDisc = smoothstep(1.0, 0.58, r) * (0.45 + 0.55 * smoothstep(0.25, 0.85, r));
  float opticalProfile = mix(sharpProfile, bokehDisc, smoothstep(0.08, 0.72, vCoc));

  float endFade = smoothstep(0.0, 0.06, vSCoord) * smoothstep(1.0, 0.94, vSCoord);

  // Strand family color affinity (60% electric cyan-blue dominant, 40% bioluminescent magenta dominant)
  float strandIsMagenta = step(0.58, vColorBias);

  vec3 electricBlue   = vec3(0.00, 0.86, 1.85);
  vec3 vibrantMagenta = vec3(1.85, 0.02, 0.72);
  vec3 goldenSpark    = vec3(1.75, 1.22, 0.18);

  vec3 darkCarrier = mix(
    vec3(0.00, 0.14, 0.38),
    vec3(0.34, 0.01, 0.20),
    strandIsMagenta
  );

  float blueDrive = vWaveBlue * mix(1.35, 0.25, strandIsMagenta) * uPulseIntensity;
  float magDrive  = vWaveMagenta * mix(0.22, 1.45, strandIsMagenta) * uPulseIntensity;

  vec3 waveColor = darkCarrier * 0.22
                 + electricBlue * blueDrive
                 + vibrantMagenta * magDrive
                 + goldenSpark * (vInterference * 0.85);

  // Calibrated per-strand gain so individual Villarceau fibers remain crisp and distinct
  float strandGain = 0.028 * opticalProfile * endFade * vEnergyScale * vCaptureAlpha;
  if (strandGain < 0.0003) {
    discard;
  }

  fragColor = vec4(waveColor * strandGain, strandGain);
}
`;
