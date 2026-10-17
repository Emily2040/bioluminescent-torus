/**
 * @fileoverview Main WebGL2 renderer, multi-pass optical post-processor, camera rig,
 * Director HUD controller, and deterministic telemetry API for the Bioluminescent Torus scene.
 */

import {
  TORUS_MAJOR_RADIUS,
  TORUS_MINOR_RADIUS,
  createFiberStrandBuffers,
  createGoldenDustBuffers,
  evaluateChoreographyPhase,
  raycastTorusFocalDistance,
} from "./math/torusTopology.js";
import { FIBER_VERTEX_SHADER, FIBER_FRAGMENT_SHADER } from "./shaders/fiberStrands.glsl.js";
import { GOLDEN_DUST_VERTEX_SHADER, GOLDEN_DUST_FRAGMENT_SHADER } from "./shaders/goldenDust.glsl.js";
import {
  POST_QUAD_VERTEX_SHADER,
  DOF_GATHER_FRAGMENT_SHADER,
  BLOOM_BLUR_FRAGMENT_SHADER,
  FINAL_COMPOSITE_FRAGMENT_SHADER,
} from "./shaders/postProcess.glsl.js";
import { HarmonicSynth } from "./audio/harmonicSynth.js";

// Camera Rig Preset Definitions
const CAMERA_PRESETS = {
  "macro-rim": {
    radius: 6.15,
    theta: 0.56,
    phi: 0.42,
    target: [0.85, -0.10, 0.30],
    focus: 4.65,
    aperture: 1.3,
  },
  "torus-eye": {
    radius: 4.35,
    theta: 1.18,
    phi: 0.72,
    target: [0.0, -0.08, 0.0],
    focus: 3.95,
    aperture: 1.4,
  },
  "villarceau-oblique": {
    radius: 7.85,
    theta: -0.48,
    phi: 0.56,
    target: [0.0, 0.0, 0.0],
    focus: 7.45,
    aperture: 1.8,
  },
  "wide-void": {
    radius: 9.65,
    theta: 0.24,
    phi: 0.44,
    target: [0.0, 0.0, 0.0],
    focus: 9.25,
    aperture: 2.2,
  },
};

// Minimal 4x4 Matrix Math Helpers
function createMat4() {
  return new Float32Array(16);
}

function perspectiveMat4(out, fovy, aspect, near, far) {
  const f = 1.0 / Math.tan(fovy * 0.5);
  const nf = 1.0 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1.0;
  out[14] = 2.0 * far * near * nf;
  return out;
}

function lookAtMat4(out, eye, center, up) {
  let zx = eye[0] - center[0];
  let zy = eye[1] - center[1];
  let zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1.0;
  zx /= len;
  zy /= len;
  zz /= len;

  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  len = Math.hypot(xx, xy, xz) || 1.0;
  xx /= len;
  xy /= len;
  xz /= len;

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0.0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0.0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0.0;
  out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  out[15] = 1.0;
  return out;
}

function initBioluminescentTorusApp() {
  const canvas = document.getElementById("gl-canvas");
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });

  const shaderErrors = [];
  if (!gl) {
    shaderErrors.push("WebGL2 context unavailable");
    console.error("WebGL2 is required for this experience.");
    return;
  }

  const extFloatBuffer = gl.getExtension("EXT_color_buffer_float");
  gl.getExtension("OES_texture_float_linear");
  const floatFboActive = Boolean(extFloatBuffer);

  function compileShader(type, source, label) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || "Unknown compile error";
      const msg = `[Shader Compile Error - ${label}]: ${log}`;
      shaderErrors.push(msg);
      console.error(msg);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vsSource, fsSource, label) {
    const vs = compileShader(gl.VERTEX_SHADER, vsSource, `${label}:VS`);
    const fs = compileShader(gl.FRAGMENT_SHADER, fsSource, `${label}:FS`);
    if (!vs || !fs) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || "Unknown link error";
      const msg = `[Program Link Error - ${label}]: ${log}`;
      shaderErrors.push(msg);
      console.error(msg);
      return null;
    }
    return prog;
  }

  // Compile all GPU programs
  const fiberProg = createProgram(FIBER_VERTEX_SHADER, FIBER_FRAGMENT_SHADER, "FiberStrands");
  const dustProg = createProgram(GOLDEN_DUST_VERTEX_SHADER, GOLDEN_DUST_FRAGMENT_SHADER, "GoldenDust");
  const dofProg = createProgram(POST_QUAD_VERTEX_SHADER, DOF_GATHER_FRAGMENT_SHADER, "DofGather");
  const bloomProg = createProgram(POST_QUAD_VERTEX_SHADER, BLOOM_BLUR_FRAGMENT_SHADER, "BloomBlur");
  const compositeProg = createProgram(POST_QUAD_VERTEX_SHADER, FINAL_COMPOSITE_FRAGMENT_SHADER, "FinalComposite");

  function cacheUniforms(prog, names) {
    const map = {};
    if (!prog) return map;
    for (const name of names) {
      map[name] = gl.getUniformLocation(prog, name);
    }
    return map;
  }

  const fiberUniforms = cacheUniforms(fiberProg, [
    "uViewMatrix",
    "uProjMatrix",
    "uCameraPos",
    "uTime",
    "uPulsePhase",
    "uCoalescence",
    "uFocalDistance",
    "uAperture",
    "uMajorRadius",
    "uMinorRadius",
    "uPulseIntensity",
  ]);

  const dustUniforms = cacheUniforms(dustProg, [
    "uViewMatrix",
    "uProjMatrix",
    "uTime",
    "uPulsePhase",
    "uCoalescence",
    "uFocalDistance",
    "uAperture",
    "uViewportHeight",
    "uMajorRadius",
    "uMinorRadius",
  ]);

  const dofUniforms = cacheUniforms(dofProg, [
    "uSceneTex",
    "uTexelSize",
    "uAperture",
    "uCoalescence",
  ]);

  const bloomUniforms = cacheUniforms(bloomProg, [
    "uInputTex",
    "uDirection",
    "uThreshold",
  ]);

  const compositeUniforms = cacheUniforms(compositeProg, [
    "uDofTex",
    "uBloomTightTex",
    "uBloomWideTex",
    "uTime",
    "uAperture",
    "uCoalescence",
  ]);

  // Build Geometry & Particle Buffers
  const fiberBuffers = createFiberStrandBuffers();
  const dustBuffers = createGoldenDustBuffers();

  // 1. Fiber-Optic Strands VAO (Instanced)
  const fiberVao = gl.createVertexArray();
  gl.bindVertexArray(fiberVao);

  const templateVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, templateVbo);
  gl.bufferData(gl.ARRAY_BUFFER, fiberBuffers.templateVertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  gl.vertexAttribDivisor(0, 0);

  const strandParamsVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, strandParamsVbo);
  gl.bufferData(gl.ARRAY_BUFFER, fiberBuffers.strandParams, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(1, 1);

  const strandMetaVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, strandMetaVbo);
  gl.bufferData(gl.ARRAY_BUFFER, fiberBuffers.strandMeta, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
  gl.vertexAttribDivisor(2, 1);

  // 2. 1,000,000 Golden Dust Particles VAO
  const dustVao = gl.createVertexArray();
  gl.bindVertexArray(dustVao);

  const dustVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, dustVbo);
  gl.bufferData(gl.ARRAY_BUFFER, dustBuffers.particleData, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);

  // 3. Empty VAO for Fullscreen Post-Processing Triangle
  const quadVao = gl.createVertexArray();
  gl.bindVertexArray(null);

  // Offscreen Framebuffer Management
  let fboResources = null;

  function createColorTarget(width, height, withDepth = false) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internalFormat = floatFboActive ? gl.RGBA16F : gl.RGBA8;
    const type = floatFboActive ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    let depthRb = null;
    if (withDepth) {
      depthRb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex, depthRb, width, height };
  }

  function destroyTarget(target) {
    if (!target) return;
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.tex);
    if (target.depthRb) gl.deleteRenderbuffer(target.depthRb);
  }

  function rebuildFramebuffers(width, height) {
    if (fboResources) {
      destroyTarget(fboResources.scene);
      destroyTarget(fboResources.dof);
      destroyTarget(fboResources.bloomTightA);
      destroyTarget(fboResources.bloomTightB);
      destroyTarget(fboResources.bloomWideA);
      destroyTarget(fboResources.bloomWideB);
    }

    const halfW = Math.max(2, width >> 1);
    const halfH = Math.max(2, height >> 1);
    const quarterW = Math.max(2, width >> 2);
    const quarterH = Math.max(2, height >> 2);

    fboResources = {
      scene: createColorTarget(width, height, true),
      dof: createColorTarget(width, height, false),
      bloomTightA: createColorTarget(halfW, halfH, false),
      bloomTightB: createColorTarget(halfW, halfH, false),
      bloomWideA: createColorTarget(quarterW, quarterH, false),
      bloomWideB: createColorTarget(quarterW, quarterH, false),
    };
  }

  function resizeViewport() {
    const dpr = Math.min(window.devicePixelRatio || 1.0, 2.0);
    const width = Math.max(2, Math.floor(window.innerWidth * dpr));
    const height = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== width || canvas.height !== height || !fboResources) {
      canvas.width = width;
      canvas.height = height;
      rebuildFramebuffers(width, height);
    }
  }

  resizeViewport();
  window.addEventListener("resize", resizeViewport);

  // Simulation, Camera & Director State
  const state = {
    simTime: 18.0,
    pulsePhase: 0.42,
    cyclePhase: 0.64,         // Default in Harmonic Resonance so torus is immediately breathtaking
    slowMoSpeed: 0.25,        // Cinematic slow motion default
    pulseTempo: 1.0,
    aperture: 1.4,            // Macro shallow depth of field
    focalDistance: 4.35,
    cameraPreset: "macro-rim",
    camRadius: CAMERA_PRESETS["macro-rim"].radius,
    camTheta: CAMERA_PRESETS["macro-rim"].theta,
    camPhi: CAMERA_PRESETS["macro-rim"].phi,
    camTarget: [...CAMERA_PRESETS["macro-rim"].target],
    targetCamRadius: CAMERA_PRESETS["macro-rim"].radius,
    targetCamTheta: CAMERA_PRESETS["macro-rim"].theta,
    targetCamPhi: CAMERA_PRESETS["macro-rim"].phi,
    targetCamCenter: [...CAMERA_PRESETS["macro-rim"].target],
    targetFocus: CAMERA_PRESETS["macro-rim"].focus,
    paused: false,
    phaseLocked: false,
    hudHidden: false,
    frameCount: 0,
    coalescence: 1.0,
    pulseIntensity: 1.0,
    phaseIndex: 3,
    phaseName: "Harmonic Resonance",
  };

  const synth = new HarmonicSynth();
  const viewMatrix = createMat4();
  const projMatrix = createMat4();
  const currentCameraPos = [0, 0, 5];

  // DOM Elements
  const dom = {
    hud: document.getElementById("director-hud"),
    restoreBtn: document.getElementById("hud-restore-btn"),
    hideBtn: document.getElementById("hud-hide-btn"),
    audioBtn: document.getElementById("audio-toggle-btn"),
    audioBtnText: document.getElementById("audio-btn-text"),
    badgeCoalescence: document.getElementById("badge-coalescence"),
    phasePills: Array.from(document.querySelectorAll(".phase-pill")),
    camPills: Array.from(document.querySelectorAll(".cam-pill")),
    playPauseBtn: document.getElementById("play-pause-btn"),
    phaseLockBtn: document.getElementById("phase-lock-btn"),
    timelineSlider: document.getElementById("timeline-slider"),
    timelineReadout: document.getElementById("timeline-readout"),
    speedSlider: document.getElementById("speed-slider"),
    speedReadout: document.getElementById("speed-readout"),
    apertureSlider: document.getElementById("aperture-slider"),
    apertureReadout: document.getElementById("aperture-readout"),
    focusSlider: document.getElementById("focus-slider"),
    focusReadout: document.getElementById("focus-readout"),
    pulseSlider: document.getElementById("pulse-slider"),
    pulseReadout: document.getElementById("pulse-readout"),
    focusReticle: document.getElementById("focus-reticle"),
    reticleLabel: document.getElementById("reticle-label"),
  };

  function syncHudReadouts() {
    const ch = evaluateChoreographyPhase(state.cyclePhase);
    state.coalescence = ch.coalescence;
    state.pulseIntensity = ch.pulseIntensity;
    state.phaseIndex = ch.phaseIndex;
    state.phaseName = ch.phaseName;

    dom.timelineSlider.value = state.cyclePhase.toFixed(4);
    dom.timelineReadout.textContent = state.cyclePhase.toFixed(3);
    dom.badgeCoalescence.textContent = `COALESCENCE ${Math.round(state.coalescence * 100)}%`;

    dom.speedSlider.value = state.slowMoSpeed.toFixed(2);
    dom.speedReadout.textContent = `${state.slowMoSpeed.toFixed(2)}x`;

    dom.apertureSlider.value = state.aperture.toFixed(1);
    dom.apertureReadout.textContent = `f/${state.aperture.toFixed(1)}`;

    dom.focusSlider.value = state.focalDistance.toFixed(2);
    dom.focusReadout.textContent = `${state.focalDistance.toFixed(2)}m`;

    dom.pulseSlider.value = state.pulseTempo.toFixed(2);
    dom.pulseReadout.textContent = `${state.pulseTempo.toFixed(2)}x`;

    dom.playPauseBtn.textContent = state.paused ? "PLAY" : "PAUSE";
    dom.phaseLockBtn.textContent = state.phaseLocked ? "PHASE LOCKED" : "LOCK PHASE";
    dom.phaseLockBtn.classList.toggle("locked", state.phaseLocked);
    dom.phaseLockBtn.setAttribute("aria-pressed", String(state.phaseLocked));

    dom.phasePills.forEach((pill, idx) => {
      pill.classList.toggle("active", idx === state.phaseIndex);
    });

    dom.camPills.forEach((pill) => {
      pill.classList.toggle("active", pill.dataset.cam === state.cameraPreset);
    });

    dom.hud.classList.toggle("hidden", state.hudHidden);
    dom.restoreBtn.classList.toggle("hidden", !state.hudHidden);
  }

  function applyCameraPreset(presetKey, immediate = false) {
    const preset = CAMERA_PRESETS[presetKey];
    if (!preset) return;
    state.cameraPreset = presetKey;
    state.targetCamRadius = preset.radius;
    state.targetCamTheta = preset.theta;
    state.targetCamPhi = preset.phi;
    state.targetCamCenter = [...preset.target];
    state.targetFocus = preset.focus;
    state.aperture = preset.aperture;
    if (immediate) {
      state.camRadius = preset.radius;
      state.camTheta = preset.theta;
      state.camPhi = preset.phi;
      state.camTarget = [...preset.target];
      state.focalDistance = preset.focus;
    }
    syncHudReadouts();
  }

  // Bind HUD Controls
  dom.phasePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const targetPhase = parseFloat(pill.dataset.target);
      if (!Number.isNaN(targetPhase)) {
        state.cyclePhase = targetPhase;
        syncHudReadouts();
      }
    });
  });

  dom.camPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      applyCameraPreset(pill.dataset.cam, false);
    });
  });

  dom.playPauseBtn.addEventListener("click", () => {
    state.paused = !state.paused;
    syncHudReadouts();
  });

  dom.phaseLockBtn.addEventListener("click", () => {
    state.phaseLocked = !state.phaseLocked;
    syncHudReadouts();
  });

  dom.timelineSlider.addEventListener("input", (e) => {
    state.cyclePhase = parseFloat(e.target.value);
    syncHudReadouts();
  });

  dom.speedSlider.addEventListener("input", (e) => {
    state.slowMoSpeed = parseFloat(e.target.value);
    syncHudReadouts();
  });

  dom.apertureSlider.addEventListener("input", (e) => {
    state.aperture = parseFloat(e.target.value);
    syncHudReadouts();
  });

  dom.focusSlider.addEventListener("input", (e) => {
    state.focalDistance = parseFloat(e.target.value);
    state.targetFocus = state.focalDistance;
    syncHudReadouts();
  });

  dom.pulseSlider.addEventListener("input", (e) => {
    state.pulseTempo = parseFloat(e.target.value);
    syncHudReadouts();
  });

  dom.hideBtn.addEventListener("click", () => {
    state.hudHidden = true;
    syncHudReadouts();
  });

  dom.restoreBtn.addEventListener("click", () => {
    state.hudHidden = false;
    syncHudReadouts();
  });

  dom.audioBtn.addEventListener("click", () => {
    const active = synth.toggle();
    dom.audioBtn.classList.toggle("active", active);
    dom.audioBtn.setAttribute("aria-pressed", String(active));
    dom.audioBtnText.textContent = active ? "HARMONIC SYNTH: ON" : "HARMONIC SYNTH: OFF";
  });

  // Pointer Orbit, Zoom & Click-to-Rack-Focus
  let isDragging = false;
  let dragMoved = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let reticleTimer = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    dragMoved = 0;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragMoved += Math.hypot(dx, dy);

    state.targetCamTheta -= dx * 0.0055;
    state.targetCamPhi = Math.max(-1.25, Math.min(1.35, state.targetCamPhi + dy * 0.0045));
  });

  canvas.addEventListener("pointerup", (e) => {
    if (!isDragging) return;
    isDragging = false;
    canvas.releasePointerCapture(e.pointerId);

    // If pointer barely moved, treat as optical Click-to-Focus raycast
    if (dragMoved < 5.0) {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0);
      const aspect = canvas.width / Math.max(1, canvas.height);
      const fovRad = (42.0 * Math.PI) / 180.0;

      const hitDepth = raycastTorusFocalDistance(
        ndcX,
        ndcY,
        currentCameraPos,
        state.camTarget,
        fovRad,
        aspect
      );

      state.focalDistance = hitDepth;
      state.targetFocus = hitDepth;
      syncHudReadouts();

      // Show animated optical focus reticle at click position
      dom.focusReticle.style.left = `${e.clientX}px`;
      dom.focusReticle.style.top = `${e.clientY}px`;
      dom.reticleLabel.textContent = `FOCUS ${hitDepth.toFixed(2)}m`;
      dom.focusReticle.classList.remove("hidden");
      void dom.focusReticle.offsetWidth;
      if (reticleTimer) clearTimeout(reticleTimer);
      reticleTimer = setTimeout(() => {
        dom.focusReticle.classList.add("hidden");
      }, 850);
    }
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.targetCamRadius = Math.max(2.6, Math.min(13.5, state.targetCamRadius + e.deltaY * 0.0035));
    },
    { passive: false }
  );

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    if (e.code === "Space") {
      e.preventDefault();
      state.paused = !state.paused;
      syncHudReadouts();
    } else if (e.code === "KeyH") {
      state.hudHidden = !state.hudHidden;
      syncHudReadouts();
    } else if (e.code === "KeyL") {
      state.phaseLocked = !state.phaseLocked;
      syncHudReadouts();
    } else if (e.code === "KeyM") {
      dom.audioBtn.click();
    } else if (e.code === "Digit1") {
      state.cyclePhase = 0.06;
      syncHudReadouts();
    } else if (e.code === "Digit2") {
      state.cyclePhase = 0.24;
      syncHudReadouts();
    } else if (e.code === "Digit3") {
      state.cyclePhase = 0.44;
      syncHudReadouts();
    } else if (e.code === "Digit4") {
      state.cyclePhase = 0.64;
      syncHudReadouts();
    } else if (e.code === "Digit5") {
      state.cyclePhase = 0.88;
      syncHudReadouts();
    }
  });

  /**
   * Renders one complete multi-pass HDR frame.
   */
  function renderFrame() {
    if (!fboResources || shaderErrors.length > 0) return;

    const ch = evaluateChoreographyPhase(state.cyclePhase);
    state.coalescence = ch.coalescence;
    state.pulseIntensity = ch.pulseIntensity;
    state.phaseIndex = ch.phaseIndex;
    state.phaseName = ch.phaseName;

    // Smooth camera spherical coordinates
    const camOrbitDrift = state.simTime * 0.045;
    const effectiveTheta = state.camTheta + camOrbitDrift;
    const cosPhi = Math.cos(state.camPhi);
    const sinPhi = Math.sin(state.camPhi);

    currentCameraPos[0] = state.camTarget[0] + state.camRadius * cosPhi * Math.sin(effectiveTheta);
    currentCameraPos[1] = state.camTarget[1] + state.camRadius * sinPhi;
    currentCameraPos[2] = state.camTarget[2] + state.camRadius * cosPhi * Math.cos(effectiveTheta);

    const aspect = canvas.width / Math.max(1, canvas.height);
    const fovRad = (42.0 * Math.PI) / 180.0;
    perspectiveMat4(projMatrix, fovRad, aspect, 0.15, 45.0);
    lookAtMat4(viewMatrix, currentCameraPos, state.camTarget, [0.0, 1.0, 0.0]);

    // PASS 1: Render HDR 3D Scene (Fiber-Optic Strands + 1,000,000 Golden Dust Particles)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.scene.fbo);
    gl.viewport(0, 0, fboResources.scene.width, fboResources.scene.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Additive HDR energy blending in linear floating-point space
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);

    // 1A: Draw 2,048 Instanced 128-Segment Bioluminescent Fiber-Optic Strands (262,144 segments)
    gl.useProgram(fiberProg);
    gl.uniformMatrix4fv(fiberUniforms.uViewMatrix, false, viewMatrix);
    gl.uniformMatrix4fv(fiberUniforms.uProjMatrix, false, projMatrix);
    gl.uniform3fv(fiberUniforms.uCameraPos, currentCameraPos);
    gl.uniform1f(fiberUniforms.uTime, state.simTime);
    gl.uniform1f(fiberUniforms.uPulsePhase, state.pulsePhase);
    gl.uniform1f(fiberUniforms.uCoalescence, state.coalescence);
    gl.uniform1f(fiberUniforms.uFocalDistance, state.focalDistance);
    gl.uniform1f(fiberUniforms.uAperture, state.aperture);
    gl.uniform1f(fiberUniforms.uMajorRadius, TORUS_MAJOR_RADIUS);
    gl.uniform1f(fiberUniforms.uMinorRadius, TORUS_MINOR_RADIUS);
    gl.uniform1f(fiberUniforms.uPulseIntensity, state.pulseIntensity);

    gl.bindVertexArray(fiberVao);
    gl.drawArraysInstanced(
      gl.TRIANGLE_STRIP,
      0,
      fiberBuffers.verticesPerStrand,
      fiberBuffers.strandCount
    );

    // 1B: Draw 1,000,000 Golden Dust & Micro-Spark Particles with Premultiplied Alpha Bokeh Layering
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(dustProg);
    gl.uniformMatrix4fv(dustUniforms.uViewMatrix, false, viewMatrix);
    gl.uniformMatrix4fv(dustUniforms.uProjMatrix, false, projMatrix);
    gl.uniform1f(dustUniforms.uTime, state.simTime);
    gl.uniform1f(dustUniforms.uPulsePhase, state.pulsePhase);
    gl.uniform1f(dustUniforms.uCoalescence, state.coalescence);
    gl.uniform1f(dustUniforms.uFocalDistance, state.focalDistance);
    gl.uniform1f(dustUniforms.uAperture, state.aperture);
    gl.uniform1f(dustUniforms.uViewportHeight, fboResources.scene.height);
    gl.uniform1f(dustUniforms.uMajorRadius, TORUS_MAJOR_RADIUS);
    gl.uniform1f(dustUniforms.uMinorRadius, TORUS_MINOR_RADIUS);

    gl.bindVertexArray(dustVao);
    gl.drawArrays(gl.POINTS, 0, dustBuffers.count);

    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(quadVao);

    // PASS 2: Golden-Angle Vogel Disk Macro Depth-of-Field Gather
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.dof.fbo);
    gl.viewport(0, 0, fboResources.dof.width, fboResources.dof.height);
    gl.useProgram(dofProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.scene.tex);
    gl.uniform1i(dofUniforms.uSceneTex, 0);
    gl.uniform2f(
      dofUniforms.uTexelSize,
      1.0 / fboResources.scene.width,
      1.0 / fboResources.scene.height
    );
    gl.uniform1f(dofUniforms.uAperture, state.aperture);
    gl.uniform1f(dofUniforms.uCoalescence, state.coalescence);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // PASS 3: Multi-Scale Separable HDR Bloom Pyramid (Tight & Wide)
    gl.useProgram(bloomProg);
    gl.uniform1i(bloomUniforms.uInputTex, 0);

    // Tight Bloom Horizontal (with soft highlight threshold)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.bloomTightA.fbo);
    gl.viewport(0, 0, fboResources.bloomTightA.width, fboResources.bloomTightA.height);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.dof.tex);
    gl.uniform2f(bloomUniforms.uDirection, 1.0 / fboResources.bloomTightA.width, 0.0);
    gl.uniform1f(bloomUniforms.uThreshold, 0.35);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Tight Bloom Vertical
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.bloomTightB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.bloomTightA.tex);
    gl.uniform2f(bloomUniforms.uDirection, 0.0, 1.0 / fboResources.bloomTightB.height);
    gl.uniform1f(bloomUniforms.uThreshold, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Wide Bloom Horizontal (downsampled from Tight Bloom)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.bloomWideA.fbo);
    gl.viewport(0, 0, fboResources.bloomWideA.width, fboResources.bloomWideA.height);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.bloomTightB.tex);
    gl.uniform2f(bloomUniforms.uDirection, 1.5 / fboResources.bloomWideA.width, 0.0);
    gl.uniform1f(bloomUniforms.uThreshold, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Wide Bloom Vertical
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboResources.bloomWideB.fbo);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.bloomWideA.tex);
    gl.uniform2f(bloomUniforms.uDirection, 0.0, 1.5 / fboResources.bloomWideB.height);
    gl.uniform1f(bloomUniforms.uThreshold, 0.0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // PASS 4: Final Optical Chromatic Dispersion & ACES Filmic Composite to Screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(compositeProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.dof.tex);
    gl.uniform1i(compositeUniforms.uDofTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.bloomTightB.tex);
    gl.uniform1i(compositeUniforms.uBloomTightTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, fboResources.bloomWideB.tex);
    gl.uniform1i(compositeUniforms.uBloomWideTex, 2);

    gl.uniform1f(compositeUniforms.uTime, state.simTime);
    gl.uniform1f(compositeUniforms.uAperture, state.aperture);
    gl.uniform1f(compositeUniforms.uCoalescence, state.coalescence);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    state.frameCount++;
  }

  function advanceSimulation(dtSeconds) {
    const clampedDt = Math.max(0.0, Math.min(0.25, dtSeconds));
    const effectiveDt = clampedDt * state.slowMoSpeed;

    state.simTime += effectiveDt;
    state.pulsePhase = (state.pulsePhase + effectiveDt * 0.42 * state.pulseTempo) % 1.0;

    if (!state.phaseLocked) {
      // Full cycle period at 1.0x speed is 24 seconds (so at 0.25x slow-mo it is a 96-second epic cycle)
      state.cyclePhase = (state.cyclePhase + effectiveDt / 24.0) % 1.0;
    }

    // Smoothly damp camera toward target rig coordinates
    const damp = 1.0 - Math.exp(-clampedDt * 4.5);
    state.camRadius += (state.targetCamRadius - state.camRadius) * damp;
    state.camTheta += (state.targetCamTheta - state.camTheta) * damp;
    state.camPhi += (state.targetCamPhi - state.camPhi) * damp;
    state.focalDistance += (state.targetFocus - state.focalDistance) * damp;
    for (let i = 0; i < 3; i++) {
      state.camTarget[i] += (state.targetCamCenter[i] - state.camTarget[i]) * damp;
    }

    synth.update(state.coalescence, state.pulsePhase, state.slowMoSpeed);
    syncHudReadouts();
  }

  // Main Animation Loop
  let lastFrameTime = performance.now();
  function tick(now) {
    const dt = (now - lastFrameTime) * 0.001;
    lastFrameTime = now;

    if (!state.paused) {
      advanceSimulation(dt);
    }
    renderFrame();
    requestAnimationFrame(tick);
  }

  syncHudReadouts();
  renderFrame();
  requestAnimationFrame(tick);

  // Expose Deterministic Telemetry & Verification API on window.__TORUS_SCENE__
  window.__TORUS_SCENE__ = {
    getTelemetry() {
      return {
        webgl2Active: Boolean(gl),
        floatFboActive,
        goldenDustCount: dustBuffers.count,
        fiberStrandCount: fiberBuffers.strandCount,
        fiberSegmentCount: fiberBuffers.segmentCount,
        shaderErrors: [...shaderErrors],
        cyclePhase: state.cyclePhase,
        coalescenceFactor: state.coalescence,
        pulseIntensity: state.pulseIntensity,
        phaseIndex: state.phaseIndex,
        phaseName: state.phaseName,
        slowMoSpeed: state.slowMoSpeed,
        aperture: state.aperture,
        focalDistance: state.focalDistance,
        pulseTempo: state.pulseTempo,
        cameraPreset: state.cameraPreset,
        paused: state.paused,
        phaseLocked: state.phaseLocked,
        hudHidden: state.hudHidden,
        frameCount: state.frameCount,
        simTime: state.simTime,
        pulsePhase: state.pulsePhase,
        viewport: { width: canvas.width, height: canvas.height },
      };
    },

    setState(overrides = {}) {
      if (typeof overrides.paused === "boolean") state.paused = overrides.paused;
      if (typeof overrides.phaseLocked === "boolean") state.phaseLocked = overrides.phaseLocked;
      if (typeof overrides.hudHidden === "boolean") state.hudHidden = overrides.hudHidden;
      if (typeof overrides.cameraPreset === "string") {
        applyCameraPreset(overrides.cameraPreset, true);
      }
      if (typeof overrides.cameraPresetSmooth === "string") {
        applyCameraPreset(overrides.cameraPresetSmooth, false);
      }
      if (typeof overrides.cyclePhase === "number") state.cyclePhase = overrides.cyclePhase;
      if (typeof overrides.simTime === "number") state.simTime = overrides.simTime;
      if (typeof overrides.pulsePhase === "number") state.pulsePhase = overrides.pulsePhase;
      if (typeof overrides.slowMoSpeed === "number") state.slowMoSpeed = overrides.slowMoSpeed;
      if (typeof overrides.aperture === "number") state.aperture = overrides.aperture;
      if (typeof overrides.focalDistance === "number") {
        state.focalDistance = overrides.focalDistance;
        state.targetFocus = overrides.focalDistance;
      }
      if (typeof overrides.pulseTempo === "number") state.pulseTempo = overrides.pulseTempo;

      syncHudReadouts();
      renderFrame();
      return this.getTelemetry();
    },

    stepSimulation(deltaSeconds = 1.0) {
      advanceSimulation(deltaSeconds);
      renderFrame();
      return this.getTelemetry();
    },

    sampleFramebufferMetrics() {
      renderFrame();
      const w = canvas.width;
      const h = canvas.height;
      const pixels = new Uint8Array(w * h * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // 1. Outer Dark Void Corner Luminance (top/bottom 8% x left/right 8% corners)
      let cornerLumSum = 0;
      let cornerPixelCount = 0;

      // 2. Torus Ring Zone vs Outer Peripheral Zone Luminance
      let ringLumSum = 0;
      let ringPixelCount = 0;
      let outerLumSum = 0;
      let outerPixelCount = 0;

      // 3. Spectral Signature Counts (Electric Blue, Bioluminescent Magenta, Golden Dust)
      let electricBluePixels = 0;
      let magentaPixels = 0;
      let goldenDustPixels = 0;

      // 4. Golden Bokeh & Out-of-Focus Disc Footprint Count
      let bokehSpreadPixels = 0;

      const stride = 2; // Sample every 2nd pixel in X and Y for fast exact metrics
      for (let y = 0; y < h; y += stride) {
        const ny = (y / h) * 2.0 - 1.0;
        const isCornerY = y < h * 0.08 || y > h * 0.92;
        for (let x = 0; x < w; x += stride) {
          const nx = (x / w) * 2.0 - 1.0;
          const idx = (y * w + x) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

          const isCornerX = x < w * 0.08 || x > w * 0.92;
          if (isCornerX && isCornerY) {
            cornerLumSum += lum;
            cornerPixelCount++;
          }

          const radial = Math.hypot(nx * 0.85, ny);
          if (radial >= 0.16 && radial <= 0.68) {
            ringLumSum += lum;
            ringPixelCount++;
          } else if (radial > 0.78) {
            outerLumSum += lum;
            outerPixelCount++;
          }

          // Spectral class detectors
          if (b >= 120 && g >= 75 && b > r * 1.35) {
            electricBluePixels++;
          }
          if (r >= 120 && b >= 85 && r > g * 1.45 && b > g * 1.15) {
            magentaPixels++;
          }
          if (r >= 110 && g >= 72 && r > b * 1.25 && g > b * 1.02) {
            goldenDustPixels++;
            bokehSpreadPixels++;
          }
        }
      }

      const cornerDarkVoidMean = cornerLumSum / Math.max(1, cornerPixelCount);
      const torusRingMeanLuminance = ringLumSum / Math.max(1, ringPixelCount);
      const outerVoidMeanLuminance = outerLumSum / Math.max(1, outerPixelCount);
      const ringToOuterRatio = torusRingMeanLuminance / Math.max(0.5, outerVoidMeanLuminance);

      return {
        cornerDarkVoidMean,
        torusRingMeanLuminance,
        outerVoidMeanLuminance,
        ringToOuterRatio,
        electricBluePixels,
        magentaPixels,
        goldenDustPixels,
        bokehSpreadPixels,
      };
    },
  };
}

initBioluminescentTorusApp();
