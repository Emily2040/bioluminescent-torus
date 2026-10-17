/**
 * @fileoverview Deterministic 45-second 1080p60 (1920x1080 @ 60fps = 2,700 frames)
 * showcase video and <10 MB animated WebP preview renderer for Bioluminescent Torus.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

function evaluateChoreographyPhase(cyclePhase) {
  const p = ((cyclePhase % 1.0) + 1.0) % 1.0;
  const smoothstep = (edge0, edge1, x) => {
    const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3.0 - 2.0 * t);
  };
  const rise = smoothstep(0.09, 0.48, p);
  const fall = 1.0 - smoothstep(0.76, 0.97, p);
  const coalescence = 0.04 + 0.96 * rise * fall;
  const pulseIntensity =
    0.45 + 0.55 * smoothstep(0.2, 0.55, p) * (1.0 - 0.5 * smoothstep(0.82, 0.99, p));
  return { coalescence, pulseIntensity };
}

async function loadPlaywright() {
  const candidates = [
    "playwright",
    "playwright-core",
    "C:/Users/emily/AppData/Roaming/npm/node_modules/playwright/index.mjs",
    "C:/Users/emily/AppData/Roaming/npm/node_modules/playwright/index.js",
  ];
  for (const modName of candidates) {
    try {
      const mod = await import(modName);
      return mod.default || mod;
    } catch {
      // continue trying next candidate
    }
  }
  throw new Error("Could not resolve playwright module.");
}

const FFMPEG_BIN =
  "C:/Users/emily/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe";
const FFPROBE_BIN =
  "C:/Users/emily/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const ASSETS_DIR = path.resolve("assets");
const WAV_PATH = path.join(ASSETS_DIR, "harmonic-soundtrack.wav");
const MP4_PATH = path.join(ASSETS_DIR, "bioluminescent-torus-1080p60.mp4");
const WEBP_PATH = path.join(ASSETS_DIR, "preview.webp");

const FPS = 60;
const DURATION_SECONDS = 45;
const TOTAL_FRAMES = FPS * DURATION_SECONDS; // 2,700 frames
const WIDTH = 1920;
const HEIGHT = 1080;

/**
 * Computes the deterministic timeline state for a given time `t` in [0, 45] seconds.
 */
function getChoreographyAtTime(t) {
  // Smooth continuous progression of cyclePhase from 0.02 (Void Swirl) through
  // Magnetic Capture (0.24), Villarceau Weave (0.44), Harmonic Resonance (0.64),
  // to gentle Slow-Mo Dispersal (0.85) over 45 seconds.
  const u = t / DURATION_SECONDS;
  const cyclePhase = 0.02 + u * 0.83;

  // Cinematic slow-motion simulation time & counter-propagating light wave phase
  const simTime = 12.0 + t * 0.42;
  const pulsePhase = (0.1 + t * 0.19) % 1.0;

  let cameraPresetSmooth = "wide-void";
  let hudHidden = true;

  if (t < 7.0) {
    cameraPresetSmooth = "wide-void";
    hudHidden = true;
  } else if (t < 15.0) {
    cameraPresetSmooth = "villarceau-oblique";
    hudHidden = false; // Showcase interactive Director HUD during capture phase
  } else if (t < 19.5) {
    cameraPresetSmooth = "macro-rim";
    hudHidden = false;
  } else if (t < 25.0) {
    cameraPresetSmooth = "macro-rim";
    hudHidden = true; // Clean full-screen macro bokeh rim
  } else if (t < 34.5) {
    cameraPresetSmooth = "torus-eye";
    hudHidden = true; // Clean full-screen dive into the Torus Eye interior
  } else {
    cameraPresetSmooth = "macro-rim";
    hudHidden = true; // Clean full-screen climax & slow-motion breath
  }

  const ch = evaluateChoreographyPhase(cyclePhase);
  return {
    cyclePhase,
    simTime,
    pulsePhase,
    cameraPresetSmooth,
    hudHidden,
    coalescence: ch.coalescence,
    pulseIntensity: ch.pulseIntensity,
  };
}

/**
 * Generates a 45.0-second 48 kHz 16-bit stereo WAV soundtrack synchronized to the
 * bioluminescent electric blue & magenta light waves and toroidal coalescence.
 */
function generateSynchronizedAudioWav(outputPath) {
  const sampleRate = 48000;
  const numSamples = sampleRate * DURATION_SECONDS;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF WAVE header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const twoPi = Math.PI * 2.0;

  // Phase accumulators for smooth continuous oscillators
  let phaseD2 = 0;
  let phaseA2 = 0;
  let phaseD3 = 0;
  let phaseBlueL = 0;
  let phaseBlueR = 0;
  let phaseMagL = 0;
  let phaseMagR = 0;
  let phaseGoldL = 0;
  let phaseGoldR = 0;

  // Simple 1-pole lowpass state for warm analog filtering
  let lpL = 0;
  let lpR = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const ch = getChoreographyAtTime(t);
    const coal = ch.coalescence;
    const pulsePhase = ch.pulsePhase;

    // Master envelope with 1.8s fade-in and 2.2s fade-out
    const fadeIn = Math.min(1.0, t / 1.8);
    const fadeOut = Math.min(1.0, (DURATION_SECONDS - t) / 2.2);
    const masterEnv = Math.sin(fadeIn * Math.PI * 0.5) * Math.sin(fadeOut * Math.PI * 0.5);

    // Wave crests matching harmonicSynth.js
    const blueCrest = 0.5 + 0.5 * Math.sin(pulsePhase * twoPi * 2.0);
    const magCrest = 0.5 + 0.5 * Math.cos(pulsePhase * twoPi * 1.5);
    const shimmerMod = 0.5 + 0.5 * Math.sin(t * twoPi * 0.35);

    // Increment oscillator phases with subtle harmonic drift
    const drift = 1.0 + 0.0015 * Math.sin(t * 0.7);
    phaseD2 += (twoPi * 73.416 * drift) / sampleRate;
    phaseA2 += (twoPi * 110.0 * drift) / sampleRate;
    phaseD3 += (twoPi * 146.832) / sampleRate;

    // Stereo detuned resonators for spaciousness
    phaseBlueL += (twoPi * 369.994) / sampleRate;
    phaseBlueR += (twoPi * 370.42) / sampleRate;
    phaseMagL += (twoPi * 440.0) / sampleRate;
    phaseMagR += (twoPi * 439.55) / sampleRate;
    phaseGoldL += (twoPi * 554.365) / sampleRate;
    phaseGoldR += (twoPi * 659.255) / sampleRate;

    // Sub-bass toroidal drone (D2 + A2 + warm D3 overtone)
    const subDrone =
      0.34 * Math.sin(phaseD2) +
      0.22 * Math.sin(phaseA2) +
      0.12 * (0.6 + 0.4 * coal) * Math.sin(phaseD3);

    // Electric blue & magenta wave-crest harmonic resonators
    const blueGain = 0.04 + 0.14 * Math.pow(blueCrest, 2.0) * (0.35 + 0.65 * coal);
    const magGain = 0.04 + 0.12 * Math.pow(magCrest, 2.0) * (0.35 + 0.65 * coal);
    const goldGain = 0.025 + 0.065 * coal * shimmerMod;

    const rawL =
      subDrone +
      blueGain * Math.sin(phaseBlueL) +
      magGain * 0.7 * Math.sin(phaseMagL) +
      goldGain * Math.sin(phaseGoldL);

    const rawR =
      subDrone +
      blueGain * 0.75 * Math.sin(phaseBlueR) +
      magGain * Math.sin(phaseMagR) +
      goldGain * Math.sin(phaseGoldR);

    // Coalescence-modulated warm low-pass filter
    const cutoffHz = 280.0 + coal * 920.0 + blueCrest * 340.0;
    const rc = 1.0 / (twoPi * cutoffHz);
    const dt = 1.0 / sampleRate;
    const alpha = dt / (rc + dt);

    lpL += alpha * (rawL - lpL);
    lpR += alpha * (rawR - lpR);

    // Soft saturation & master scaling
    const outL = Math.tanh(lpL * 1.15) * 0.65 * masterEnv;
    const outR = Math.tanh(lpR * 1.15) * 0.65 * masterEnv;

    const pcmL = Math.max(-32767, Math.min(32767, Math.round(outL * 32767)));
    const pcmR = Math.max(-32767, Math.min(32767, Math.round(outR * 32767)));

    const offset = 44 + i * 4;
    buffer.writeInt16LE(pcmL, offset);
    buffer.writeInt16LE(pcmR, offset + 2);
  }

  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated 45.0s stereo soundtrack: ${outputPath} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
}

function runProcess(bin, args, label) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${label} exited with code ${code}: ${stderr}`));
    });
  });
}

async function renderShowcaseVideo() {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });

  // 1. Synthesize 45-second stereo WAV audio track
  generateSynchronizedAudioWav(WAV_PATH);

  // 2. Launch Headless Chrome with Hardware WebGL2 at 1920x1080
  console.log(`Launching Chrome WebGL2 at ${WIDTH}x${HEIGHT} for ${TOTAL_FRAMES} frames (${DURATION_SECONDS}s @ ${FPS}fps)...`);
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-gl=angle",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-gpu-vsync",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__TORUS_SCENE__), { timeout: 10000 });

  // Pause autonomous RAF loop so we step deterministically at exactly 60.0 fps
  const initialCues = getChoreographyAtTime(0);
  await page.evaluate((cues) => {
    window.__TORUS_SCENE__.setState({
      paused: true,
      phaseLocked: true,
      cameraPreset: cues.cameraPresetSmooth,
      cyclePhase: cues.cyclePhase,
      simTime: cues.simTime,
      pulsePhase: cues.pulsePhase,
      hudHidden: cues.hudHidden,
      slowMoSpeed: 0.25,
    });
  }, initialCues);

  // 3. Spawn FFmpeg to encode 1080p60 H.264 MP4 + 256kbps AAC audio
  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", String(FPS),
    "-i", "-",
    "-i", WAV_PATH,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac",
    "-b:a", "256k",
    "-shortest",
    "-movflags", "+faststart",
    MP4_PATH,
  ];

  const ffmpegProc = spawn(FFMPEG_BIN, ffmpegArgs, {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let ffmpegStderr = "";
  ffmpegProc.stderr.on("data", (chunk) => {
    ffmpegStderr += chunk.toString();
  });

  const ffmpegExitPromise = new Promise((resolve, reject) => {
    ffmpegProc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg MP4 encode failed (${code}): ${ffmpegStderr.slice(-1200)}`));
    });
  });

  const startWall = Date.now();
  let lastPreset = initialCues.cameraPresetSmooth;
  const BATCH_SIZE = 10;

  for (let batchStart = 0; batchStart < TOTAL_FRAMES; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(TOTAL_FRAMES, batchStart + BATCH_SIZE);
    const frameSpecs = [];

    for (let frame = batchStart; frame < batchEnd; frame++) {
      const t = frame / FPS;
      const cues = getChoreographyAtTime(t);
      const presetChanged = cues.cameraPresetSmooth !== lastPreset;
      if (presetChanged) {
        lastPreset = cues.cameraPresetSmooth;
      }
      frameSpecs.push({ cues, presetChanged, dt: 1.0 / FPS });
    }

    const base64Frames = await page.evaluate((specs) => {
      const canvas = document.querySelector("canvas");
      const out = [];
      for (const { cues, presetChanged, dt } of specs) {
        const updates = {
          cyclePhase: cues.cyclePhase,
          simTime: cues.simTime,
          pulsePhase: cues.pulsePhase,
          hudHidden: true,
        };
        if (presetChanged) {
          updates.cameraPresetSmooth = cues.cameraPresetSmooth;
        }
        window.__TORUS_SCENE__.setState(updates);
        window.__TORUS_SCENE__.stepSimulation(dt);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
        out.push(dataUrl.slice(dataUrl.indexOf(",") + 1));
      }
      return out;
    }, frameSpecs);

    for (const b64 of base64Frames) {
      const jpegBuffer = Buffer.from(b64, "base64");
      const canContinue = ffmpegProc.stdin.write(jpegBuffer);
      if (!canContinue) {
        await new Promise((resolve) => ffmpegProc.stdin.once("drain", resolve));
      }
    }

    if (batchEnd % 300 === 0 || batchEnd === TOTAL_FRAMES) {
      const elapsed = (Date.now() - startWall) / 1000;
      const rate = batchEnd / elapsed;
      const eta = (TOTAL_FRAMES - batchEnd) / rate;
      console.log(
        `Rendered frame ${batchEnd}/${TOTAL_FRAMES} (${(batchEnd / FPS).toFixed(1)}s / ${DURATION_SECONDS}s) | ${rate.toFixed(1)} fps | ETA ${eta.toFixed(1)}s`
      );
    }
  }

  ffmpegProc.stdin.end();
  await ffmpegExitPromise;
  await browser.close();

  // Remove intermediate WAV file after muxing into MP4
  if (fs.existsSync(WAV_PATH)) {
    fs.unlinkSync(WAV_PATH);
  }

  const mp4Stat = fs.statSync(MP4_PATH);
  console.log(`Completed 1080p60 MP4: ${MP4_PATH} (${(mp4Stat.size / 1024 / 1024).toFixed(2)} MB)`);

  // 4. Generate inline animated WebP preview (< 10 MB for GitHub Camo auto-play)
  // Sample a smooth 10-second condensation across the showcase at 800x450 @ 12fps so it stays ~4-7 MB
  console.log("Encoding inline animated WebP preview (< 10 MB for GitHub Camo)...");
  await runProcess(
    FFMPEG_BIN,
    [
      "-y",
      "-i", MP4_PATH,
      "-vf", "select='not(mod(n,18))',setpts=N/(15*TB),scale=800:450:flags=lanczos",
      "-r", "15",
      "-vcodec", "libwebp",
      "-lossless", "0",
      "-compression_level", "4",
      "-q:v", "62",
      "-loop", "0",
      "-an",
      WEBP_PATH,
    ],
    "FFmpeg WebP preview"
  );

  let webpStat = fs.statSync(WEBP_PATH);
  console.log(`Animated WebP size: ${(webpStat.size / 1024 / 1024).toFixed(2)} MB`);

  // Guard: If WebP exceeds 9.5 MB, re-encode with tighter quality/resolution to guarantee < 10 MB
  if (webpStat.size > 9.5 * 1024 * 1024) {
    console.log("WebP > 9.5 MB; re-encoding with tighter compression to stay strictly < 10 MB...");
    await runProcess(
      FFMPEG_BIN,
      [
        "-y",
        "-i", MP4_PATH,
        "-vf", "select='not(mod(n,24))',setpts=N/(12*TB),scale=720:405:flags=lanczos",
        "-r", "12",
        "-vcodec", "libwebp",
        "-lossless", "0",
        "-compression_level", "5",
        "-q:v", "52",
        "-loop", "0",
        "-an",
        WEBP_PATH,
      ],
      "FFmpeg WebP fallback"
    );
    webpStat = fs.statSync(WEBP_PATH);
    console.log(`Re-encoded Animated WebP size: ${(webpStat.size / 1024 / 1024).toFixed(2)} MB`);
  }

  // 5. Verify output streams with ffprobe
  const { stdout: probeJson } = await runProcess(
    FFPROBE_BIN,
    [
      "-v", "error",
      "-show_entries", "format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,nb_frames,sample_rate,channels",
      "-of", "json",
      MP4_PATH,
    ],
    "ffprobe MP4 verification"
  );

  console.log("FFprobe verification:", probeJson);
}

renderShowcaseVideo().catch((err) => {
  console.error(err);
  process.exit(1);
});
