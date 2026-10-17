/**
 * @fileoverview Post-processing GLSL 300 es shaders for Vogel-disk macro Depth-of-Field,
 * multi-scale HDR Bloom, axial/radial chromatic dispersion, and ACES Filmic tone mapping.
 */

export const POST_QUAD_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

out vec2 vUv;

void main() {
  // Fullscreen triangle from gl_VertexID (0, 1, 2)
  vec2 pos = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const DOF_GATHER_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uSceneTex;
uniform vec2 uTexelSize;
uniform float uAperture;     // f-stop (1.2 .. 16.0)
uniform float uCoalescence;

layout(location = 0) out vec4 fragColor;

// 16-tap Golden-Angle Vogel Disk offsets for optical bokeh gather
const float GOLDEN_ANGLE = 2.39996323;

void main() {
  vec4 centerSample = texture(uSceneTex, vUv);

  // Peripheral lens blur increases naturally toward outer frame edges and at wide apertures (low f-stop)
  vec2 centeredUv = vUv * 2.0 - 1.0;
  float radialDist = length(centeredUv);
  float apertureBlurStrength = clamp((2.2 / max(uAperture, 1.0)) - 0.12, 0.0, 1.6);

  // Alpha channel of uSceneTex accumulates local optical density; low-alpha peripheral regions
  // and off-axis macro edges receive smooth Vogel-disk bokeh integration
  float diskRadius = (1.5 + 4.8 * radialDist * radialDist) * apertureBlurStrength;

  if (diskRadius < 0.25) {
    fragColor = centerSample;
    return;
  }

  vec3 accumRgb = centerSample.rgb * 1.35;
  float totalWeight = 1.35;

  for (int i = 1; i <= 16; i++) {
    float fi = float(i);
    float r = sqrt(fi / 16.0) * diskRadius;
    float theta = fi * GOLDEN_ANGLE;
    vec2 offset = vec2(cos(theta), sin(theta)) * r * uTexelSize;

    vec3 tap = texture(uSceneTex, vUv + offset).rgb;
    float lum = dot(tap, vec3(0.2126, 0.7152, 0.0722));
    // Highlight bokeh preservation weight (bright out-of-focus discs dominate over dark background)
    float bokehWeight = 0.65 + min(lum * 1.2, 2.8);

    accumRgb += tap * bokehWeight;
    totalWeight += bokehWeight;
  }

  fragColor = vec4(accumRgb / totalWeight, centerSample.a);
}
`;

export const BLOOM_BLUR_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uInputTex;
uniform vec2 uDirection;    // (texelWidth, 0) or (0, texelHeight)
uniform float uThreshold;   // > 0 on first pass, 0 on subsequent passes

layout(location = 0) out vec4 fragColor;

vec3 applySoftThreshold(vec3 color, float threshold) {
  if (threshold <= 0.0) return color;
  float brightness = max(max(color.r, color.g), color.b);
  float soft = clamp(brightness - threshold + 0.25, 0.0, 0.5);
  soft = (soft * soft) / 1.0;
  float contrib = max(soft, brightness - threshold) / max(brightness, 0.0001);
  return color * clamp(contrib, 0.0, 1.0);
}

void main() {
  // 9-tap Gaussian kernel using 5 bilinear texture fetches
  vec2 off1 = vec2(1.3846153846) * uDirection;
  vec2 off2 = vec2(3.2307692308) * uDirection;

  vec3 c0 = applySoftThreshold(texture(uInputTex, vUv).rgb, uThreshold) * 0.2270270270;
  vec3 c1 = applySoftThreshold(texture(uInputTex, vUv + off1).rgb, uThreshold) * 0.3162162162;
  vec3 c2 = applySoftThreshold(texture(uInputTex, vUv - off1).rgb, uThreshold) * 0.3162162162;
  vec3 c3 = applySoftThreshold(texture(uInputTex, vUv + off2).rgb, uThreshold) * 0.0702702703;
  vec3 c4 = applySoftThreshold(texture(uInputTex, vUv - off2).rgb, uThreshold) * 0.0702702703;

  fragColor = vec4(c0 + c1 + c2 + c3 + c4, 1.0);
}
`;

export const FINAL_COMPOSITE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uDofTex;
uniform sampler2D uBloomTightTex;
uniform sampler2D uBloomWideTex;
uniform float uTime;
uniform float uAperture;
uniform float uCoalescence;

layout(location = 0) out vec4 fragColor;

// Narkowicz 2015 ACES Filmic Tone Mapping Curve
vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Interleaved Gradient Noise (Jimenez 2014) to eliminate 8-bit dark void banding
float interleavedGradientNoise(vec2 pixelCoord) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(pixelCoord, magic.xy)));
}

void main() {
  vec2 centered = vUv * 2.0 - 1.0;
  float radialDist = length(centered);

  // Subtle optical lateral chromatic dispersion toward lens edges
  float dispersionStrength = 0.0022 * radialDist * radialDist * clamp(2.0 / max(uAperture, 1.0), 0.35, 1.4);
  vec2 dispVec = centered * dispersionStrength;

  float rChan = texture(uDofTex, vUv + dispVec).r;
  float gChan = texture(uDofTex, vUv).g;
  float bChan = texture(uDofTex, vUv - dispVec).b;
  vec3 hdrScene = vec3(rChan, gChan, bChan);

  vec3 bloomTight = texture(uBloomTightTex, vUv).rgb;
  vec3 bloomWide  = texture(uBloomWideTex, vUv).rgb;

  // Deep abyssal void atmosphere (keeps corners dark void < 10/255 while giving subtle depth)
  float centerGlow = exp(-radialDist * radialDist * 2.8);
  vec3 voidAtmosphere = mix(
    vec3(0.001, 0.0015, 0.004),
    vec3(0.004, 0.009, 0.022) + vec3(0.008, 0.002, 0.011) * uCoalescence,
    centerGlow
  );

  vec3 combinedHdr = voidAtmosphere
                   + hdrScene * 0.92
                   + bloomTight * 0.45
                   + bloomWide * 0.32;

  // Apply optical lens vignette on outer corners
  float vignette = 1.0 - smoothstep(0.75, 1.45, radialDist) * 0.48;
  combinedHdr *= vignette;

  // Chroma-preserving ACES Filmic tone mapping
  vec3 perChannelAces = acesFilm(combinedHdr);
  float peakIn = max(max(combinedHdr.r, combinedHdr.g), max(combinedHdr.b, 1e-4));
  float peakOut = acesFilm(vec3(peakIn)).r;
  vec3 chromaPreserved = (combinedHdr / peakIn) * peakOut;
  vec3 mapped = mix(chromaPreserved, perChannelAces, 0.38);

  vec3 srgb = pow(clamp(mapped, 0.0, 1.0), vec3(1.0 / 2.2));

  // Sub-LSB dithering against dark void banding
  float dither = (interleavedGradientNoise(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) / 255.0;
  fragColor = vec4(clamp(srgb + dither, 0.0, 1.0), 1.0);
}
`;
