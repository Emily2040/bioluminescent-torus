**[English](./en.md)** · **[简体中文](./zh-CN.md)** · **[日本語](./ja.md)** · **[한국어](./ko.md)**

# Bioluminescent Fiber-Optic Torus: Prompt and Optical Specification

## Creative Seed Prompt

```text
Millions of glowing bioluminescent fiber-optic strands and golden dust particles swirling in a dark void, pulsing with rhythmic waves of electric blue and magenta light, coalescing into a complex 3D geometric torus, macro bokeh depth of field, cinematic slow motion.
```

## Production Architecture Prompt

Build a zero-dependency WebGL2 and GLSL ES 3.0 (`#version 300 es`) real-time 3D visualiser and interactive optical camera rig that executes the creative seed prompt on the GPU without external framework dependencies.

### 1. Toroidal Topology and Particle Scale

Allocate exactly `1,000,000` golden dust and micro-spark particles in a single `Float32Array` buffer generated via a 4D golden-ratio Kronecker low-discrepancy lattice (`PHI_1 = 0.6180339887`, `PHI_2 = 0.3247179572`, `PHI_3 = 0.2207440846`, `PHI_4 = 0.1673039783`), eliminating pseudo-random clumping across the toroidal shells.

Generate `2,048` instanced bioluminescent fibre-optic strands subdivided into `128` longitudinal segments each (`262,144` camera-facing oriented ribbon segments, `528,384` triangles per frame) arranged across three nested geometric families around major radius $R = 2.45$ and minor radius $r = 0.92$:

1. Inner core braids (`35%` of strands) following $(p,q) = (3,5)$ and $(5,8)$ torus-knot harmonics.
2. Primary Villarceau circle pairs (`45%` of strands) following $(1,1)$ and $(1,-1)$ counter-wound loxodromic circles that slice the torus at oblique tangent planes.
3. Outer gossamer cathedral cage (`20%` of strands) following $(2,3)$ and $(3,4)$ harmonic overtones at $1.02r$ to $1.22r$.

### 2. Five-Phase Morphogenesis Choreography

Drive the continuous transition between the dispersed dark void and the locked 3D torus through five choreographed phases along a normalised cycle parameter $p \in [0, 1]$:

| Phase ID | Name | Cycle Window | Visual State |
| :--- | :--- | :--- | :--- |
| `01` | Void Swirl | `0.00` to `0.14` | Unspooled fibre filaments and `1,000,000` golden dust particles drift through a dark abyssal void in divergence-free 3D Beltrami vortical flow. |
| `02` | Magnetic Capture | `0.14` to `0.34` | Toroidal magnetic lines tighten inward and pull inner $(3,5)$ and $(5,8)$ core braids toward the ring axis first. |
| `03` | Villarceau Weave | `0.34` to `0.52` | Counter-rotating Villarceau circles lock into an interlocking 3D geometric torus with a clear central eye. |
| `04` | Harmonic Resonance | `0.52` to `0.78` | Full 3D torus pulses with counter-propagating longitudinal waves of electric blue (`#00E5FF`) and bioluminescent magenta (`#FF1493`), igniting golden dust along wave crests. |
| `05` | Slow-Mo Dispersal | `0.78` to `1.00` | Outer shells gently unwind back into the dark void in 0.25x slow motion before beginning the next cycle. |

### 3. Physical Macro Bokeh and Post-Processing Pipeline

Compute signed circle-of-confusion radius per vertex and fragment from camera-space depth $z_{\text{view}}$, focal distance $d_{\text{focus}}$, and aperture f-stop $N \in [f/1.0, f/16.0]$:

$$\text{CoC} = \frac{|z_{\text{view}} - d_{\text{focus}}|}{z_{\text{view}}} \cdot \frac{\text{scale}}{N}$$

Render into an `RGBA16F` floating-point framebuffer where alpha stores the signed circle of confusion, followed by a 16-tap golden-angle Vogel disk depth-of-field gather pass, a dual-scale separable Gaussian HDR bloom pyramid, radial optical chromatic dispersion, and a chroma-preserving ACES Filmic tone mapper that keeps outer dark-void corners below mean luminance `18 / 255`.
