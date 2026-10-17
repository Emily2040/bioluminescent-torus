**[English](./README.md)** · **[简体中文](./README.zh-CN.md)** · **[日本語](./README.ja.md)** · **[한국어](./README.ko.md)**

# Bioluminescent Fiber-Optic Torus

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <img src="./assets/preview.webp" width="100%" alt="Bioluminescent Fiber-Optic Torus 1080p60 Preview" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Emily2040/bioluminescent-torus/releases/download/v1.0.0/bioluminescent-torus-1080p60.mp4">
    <strong>▶ Play / Download Full 1080p60 Video With Sound (45s · 1920x1080 @ 60fps)</strong>
  </a>
</p>

I built this real-time WebGL2 and GLSL ES 3.0 (`#version 300 es`) simulation to render `1,000,000` golden dust particles and `2,048` instanced bioluminescent fibre-optic strands (`262,144` oriented ribbon segments) swirling through a dark void, pulsing with counter-propagating waves of electric blue (`#00E5FF`) and bioluminescent magenta (`#FF1493`) light, and coalescing into an interlocking 3D geometric torus with physical macro bokeh depth of field and cinematic slow-motion controls.

The entire simulation runs in vanilla JavaScript and raw WebGL2 shaders without external runtime libraries.

## Multi-Phase Visual Gallery

| Phase 01: Void Swirl (`p = 0.06`) | Phase 02: Magnetic Capture (`p = 0.24`) |
| :---: | :---: |
| ![Phase 01 Void Swirl](./captures/01-void-swirl.png) | ![Phase 02 Magnetic Capture](./captures/02-magnetic-capture.png) |
| **Phase 04: Harmonic Resonance Macro Rim (`p = 0.64`)** | **Torus Eye Interior (`f/1.2` Macro Aperture)** |
| ![Phase 04 Harmonic Resonance Macro](./captures/03-harmonic-resonance-macro.png) | ![Torus Eye Interior](./captures/04-torus-eye-interior.png) |

<p align="center">
  <img src="./captures/05-clean-fullscreen-no-hud.png" width="100%" alt="Full-Screen Clean Viewport in Harmonic Resonance" />
</p>

## Mathematical and Optical Architecture

### 1. Villarceau Circles, Torus Knots, and 4D Kronecker Lattice (`src/math/torusTopology.js`)

Standard pseudo-random particle placement produces visible clumping on curved manifolds. I generated the `1,000,000` golden dust and micro-spark particles using a 4D golden-ratio Kronecker low-discrepancy sequence (`PHI_1 = 0.6180339887`, `PHI_2 = 0.3247179572`, `PHI_3 = 0.2207440846`, `PHI_4 = 0.1673039783`), allocating a single 16 MB `Float32Array` buffer uploaded once to the GPU.

For the fibre-optic strands, hardware-instanced triangle strips (`gl.drawArraysInstanced`) draw `2,048` strands subdivided into `128` longitudinal segments (`262,144` segments, `528,384` triangles per frame) around major radius $R = 2.45$ and minor radius $r = 0.92$ across three nested families:

| Family | Share of Strands | Winding Parameters $(p,q)$ | Geometric Role |
| :--- | :--- | :--- | :--- |
| Inner Core Braids | `35%` | $(3,5)$, $(5,8)$ | High-density harmonic spine inside the torus core ($0.32r$ to $0.68r$). |
| Primary Villarceau Circles | `45%` | $(1,1)$, $(1,-1)$ | Counter-rotating loxodromic circles slicing the torus at oblique tangent planes ($0.72r$ to $1.00r$). |
| Outer Gossamer Cage | `20%` | $(2,3)$, $(3,4)$ | Delicate outer harmonic filaments ($1.02r$ to $1.22r$) that peel into the void first. |

### 2. Filament Morphogenesis and Travelling Light Waves (`src/shaders/fiberStrands.glsl.js`)

Each strand interpolates between an unspooled 3D Beltrami vortical flow state in the dark void and its locked toroidal knot coordinates according to the choreography coalescence curve. In the vertex shader, camera-facing tangent cross products expand each strand in view space according to its signed circle of confusion so out-of-focus foreground and background fibres soften naturally without geometry sub-pixel aliasing.

In the fragment shader, counter-propagating longitudinal waves travel along each strand parameter $t \in [0, 1]$:

1. Primary forward waves (`sin((t * 6.0 - uPulsePhase * 2.0 + seed) * 2π)`) emit electric blue (`#00E5FF`) core energy.
2. Secondary harmonic waves (`cos((t * 10.0 + uPulsePhase * 1.5 - seed) * 2π)`) emit bioluminescent magenta (`#FF1493`).
3. Constructive wave interference crests bloom toward cyan-white (`#E8FFFF`) and excite nearby golden dust particles (`#FFD166`).

### 3. Physical Macro Bokeh and Multi-Pass HDR Pipeline (`src/shaders/goldenDust.glsl.js`, `src/shaders/postProcess.glsl.js`)

The renderer executes four GPU passes per frame into `RGBA16F` half-float framebuffers:

| Pass | Target | Operation |
| :--- | :--- | :--- |
| Pass 1 | `scene` (`RGBA16F` + `DEPTH_COMPONENT24`) | Draws `262,144` fibre ribbon segments and `1,000,000` golden dust sprites with analytical cat's-eye optical bokeh discs, bright annular aperture rims, and chromatic edge fringing. Stores signed circle of confusion in the alpha channel. |
| Pass 2 | `dof` (`RGBA16F`) | Executes a 16-tap golden-angle ($\theta = 2.399963\text{ rad}$) Vogel disk depth-of-field gather weighted by circle-of-confusion radius. |
| Pass 3 | `bloomTight` & `bloomWide` (`RGBA16F`) | Computes a dual-scale separable 9-tap Gaussian HDR bloom pyramid at half and quarter resolution. |
| Pass 4 | Default Framebuffer | Combines sharp focal planes, macro bokeh blur, dual-scale bloom, radial optical chromatic dispersion, and a chroma-preserving ACES Filmic tone mapper. |

## Interactive Director HUD and Camera Controls

| Input / Control | Action |
| :--- | :--- |
| `01 Void Swirl` to `05 Slow-Mo Dispersal` | Jump directly to any of the five morphogenesis choreography phases. |
| `Timeline Phase` (`0.000` to `1.000`) | Scrub continuously between the dispersed void and the locked 3D torus. |
| `Slow-Mo Speed` (`0.05x` to `1.50x`) | Adjust simulation time scale (`0.25x` cinematic slow motion by default). |
| `Macro Aperture` (`f/1.0` to `f/16.0`) | Control physical circle-of-confusion radius and golden bokeh disc diameter. |
| `Focal Distance` (`1.50m` to `9.00m`) | Pull optical focus from foreground bokeh dust through the torus rim to the far wall. |
| `Left-Click` on Canvas | Ray-march the 3D torus signed distance field and rack focus directly to the clicked depth. |
| `Left-Drag` / `Scroll Wheel` | Orbit camera in 3D spherical coordinates and dolly zoom between `2.6m` and `13.5m`. |
| `Macro Grazing Rim` / `Torus Eye Interior` / `Villarceau Oblique` / `Wide Void Orbit` | Smoothly transition between four optical camera rigs. |
| `Space` / `L` / `H` / `M` / `1`-`5` | Keyboard shortcuts for Play/Pause, Lock Phase, Hide/Show HUD, Harmonic Synth Audio, and Phase presets. |

## Running Locally and Verification Suite

Start the zero-dependency local HTTP server:

```bash
node serve.mjs
# Open http://127.0.0.1:4173
```

Run the automated 7-gate Playwright WebGL2 verification suite (`G1` through `G7`, including falsifiability self-test):

```bash
node verify_gates.mjs
```

Render the deterministic 45-second `1080p60` (`1920x1080` @ 60fps = `2,700` frames) MP4 showcase video with synchronised stereo harmonic audio and the `< 10 MB` inline animated WebP preview:

```bash
node render_showcase_video.mjs
```

## Build Prompts and Multilingual Documentation

The seed prompt and mathematical/optical specification are available in [`prompts/`](./prompts/README.md):

1. [English Prompt and Specification](./prompts/en.md)
2. [简体中文提示词与光学技术规范](./prompts/zh-CN.md)
3. [日本語ビルドプロンプトおよび光学仕様](./prompts/ja.md)
4. [한국어 빌드 프롬프트 및 광학 명세서](./prompts/ko.md)

## License

Released under the [MIT License](./LICENSE).
