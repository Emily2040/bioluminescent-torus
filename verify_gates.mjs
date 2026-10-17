/**
 * @fileoverview Gravitas Runtime & Optical Verification Gate Suite for Bioluminescent Torus.
 * Executes 7 falsifiable gates against a live WebGL2 Chromium instance, captures multi-phase
 * screenshots for perceptual critique, and exits non-zero if any gate fails.
 *
 * Pass `--inject-failure` to intentionally break a gate threshold and verify red exit status (1).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPTURES_DIR = path.join(__dirname, "captures");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || "/").split("?")[0];
      if (cleanUrl === "/favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const relPath = cleanUrl === "/" ? "/index.html" : cleanUrl;
      const fullPath = path.join(rootDir, decodeURIComponent(relPath));

      if (!fullPath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.readFile(fullPath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(fullPath).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
      });
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
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

export function evaluateGateAssertions(snapshot) {
  const results = [];

  // G1: Zero console errors, page errors, deprecation warnings, or WebGL shader compile/link failures
  const totalErrorCount =
    snapshot.consoleErrors.length +
    snapshot.pageErrors.length +
    snapshot.deprecationWarnings.length +
    snapshot.telemetry.shaderErrors.length;
  results.push({
    id: "G1_ZERO_CONSOLE_AND_SHADER_ERRORS",
    passed: totalErrorCount === 0,
    measured: {
      consoleErrors: snapshot.consoleErrors,
      pageErrors: snapshot.pageErrors,
      deprecationWarnings: snapshot.deprecationWarnings,
      shaderErrors: snapshot.telemetry.shaderErrors,
    },
    expected: "0 console.error, 0 pageerror, 0 deprecation warnings, and 0 WebGL shader errors",
  });

  // G2: WebGL2 active, 1,000,000 golden dust particles, and 262,144 fiber-optic strand segments
  const g2Passed =
    snapshot.telemetry.webgl2Active === true &&
    snapshot.telemetry.goldenDustCount === 1_000_000 &&
    snapshot.telemetry.fiberSegmentCount >= 250_000;
  results.push({
    id: "G2_PARTICLE_AND_STRAND_SCALE",
    passed: g2Passed,
    measured: {
      webgl2Active: snapshot.telemetry.webgl2Active,
      floatFboActive: snapshot.telemetry.floatFboActive,
      goldenDustCount: snapshot.telemetry.goldenDustCount,
      fiberStrandCount: snapshot.telemetry.fiberStrandCount,
      fiberSegmentCount: snapshot.telemetry.fiberSegmentCount,
    },
    expected: "webgl2Active=true, goldenDustCount === 1000000, fiberSegmentCount >= 250000",
  });

  // G3: Coalescence morphogenesis between Void Swirl (phase=0.06) and Harmonic Resonance (phase=0.64)
  const voidCoal = snapshot.voidState.telemetry.coalescenceFactor;
  const resCoal = snapshot.resonanceState.telemetry.coalescenceFactor;
  const voidRatio = snapshot.voidState.metrics.ringToOuterRatio;
  const resRatio = snapshot.resonanceState.metrics.ringToOuterRatio;
  const g3Passed =
    voidCoal < 0.12 &&
    resCoal > 0.92 &&
    resRatio > voidRatio * 1.35;
  results.push({
    id: "G3_COALESCENCE_MORPHOGENESIS",
    passed: g3Passed,
    measured: {
      voidCoalescence: Number(voidCoal.toFixed(4)),
      resonanceCoalescence: Number(resCoal.toFixed(4)),
      voidRingToOuterRatio: Number(voidRatio.toFixed(3)),
      resonanceRingToOuterRatio: Number(resRatio.toFixed(3)),
      concentrationLift: Number((resRatio / Math.max(0.01, voidRatio)).toFixed(3)),
    },
    expected: "voidCoalescence < 0.12, resonanceCoalescence > 0.92, and ringToOuterRatio lift > 1.35x",
  });

  // G4: Spectral signature in rendered framebuffer (Electric Blue, Bioluminescent Magenta, Golden Dust, Dark Void)
  const m = snapshot.resonanceState.metrics;
  const g4Passed =
    m.cornerDarkVoidMean < 18.0 &&
    m.electricBluePixels >= 400 &&
    m.magentaPixels >= 300 &&
    m.goldenDustPixels >= 400;
  results.push({
    id: "G4_SPECTRAL_SIGNATURE",
    passed: g4Passed,
    measured: {
      cornerDarkVoidMean: Number(m.cornerDarkVoidMean.toFixed(2)),
      electricBluePixels: m.electricBluePixels,
      magentaPixels: m.magentaPixels,
      goldenDustPixels: m.goldenDustPixels,
    },
    expected: "cornerDarkVoidMean < 18.0, electricBluePixels >= 400, magentaPixels >= 300, goldenDustPixels >= 400",
  });

  // G5: Macro Bokeh Depth-of-Field expansion when switching aperture from f/16.0 to f/1.2
  const sharpSpread = snapshot.dofSharpMetrics.bokehSpreadPixels;
  const bokehSpread = snapshot.dofMacroMetrics.bokehSpreadPixels;
  const g5Passed = bokehSpread > sharpSpread * 1.15;
  results.push({
    id: "G5_MACRO_BOKEH_DOF_RESPONSE",
    passed: g5Passed,
    measured: {
      f16SharpSpreadPixels: sharpSpread,
      f1_2MacroBokehSpreadPixels: bokehSpread,
      expansionRatio: Number((bokehSpread / Math.max(1, sharpSpread)).toFixed(3)),
    },
    expected: "f/1.2 bokehSpreadPixels > 1.15x f/16.0 bokehSpreadPixels",
  });

  // G6: Slow-Motion time-scale determinism (0.10x slow-mo vs 1.00x normal speed)
  const slowDelta = snapshot.slowMoDeltaSimTime;
  const normDelta = snapshot.normalDeltaSimTime;
  const speedRatio = slowDelta / Math.max(1e-6, normDelta);
  const g6Passed = Math.abs(speedRatio - 0.1) < 0.005;
  results.push({
    id: "G6_SLOW_MOTION_DETERMINISM",
    passed: g6Passed,
    measured: {
      slowMoDeltaSimTime: Number(slowDelta.toFixed(4)),
      normalDeltaSimTime: Number(normDelta.toFixed(4)),
      speedRatio: Number(speedRatio.toFixed(4)),
    },
    expected: "speedRatio in [0.095, 0.105] for 0.10x vs 1.00x slow-motion step",
  });

  return results;
}

async function runVerification() {
  const injectFailure = process.argv.includes("--inject-failure");
  fs.mkdirSync(CAPTURES_DIR, { recursive: true });

  const { server, url } = await startStaticServer(__dirname);
  const pw = await loadPlaywright();

  let browser;
  try {
    const launchArgs = ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"];
    try {
      browser = await pw.chromium.launch({
        channel: "chrome",
        headless: true,
        args: launchArgs,
      });
    } catch {
      browser = await pw.chromium.launch({
        channel: "msedge",
        headless: true,
        args: launchArgs,
      });
    }

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const deprecationWarnings = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") {
        consoleErrors.push(text);
      }
      if (/deprecated|has been removed/i.test(text)) {
        deprecationWarnings.push(text);
      }
    });

    page.on("pageerror", (err) => {
      pageErrors.push(String(err));
    });

    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__TORUS_SCENE__), { timeout: 10000 });

    // 1. Capture & measure Phase 01: Void Swirl
    const voidState = await page.evaluate(() => {
      const api = window.__TORUS_SCENE__;
      const telemetry = api.setState({
        paused: true,
        hudHidden: false,
        cameraPreset: "wide-void",
        cyclePhase: 0.06,
        simTime: 12.4,
        pulsePhase: 0.25,
        aperture: 1.8,
      });
      const metrics = api.sampleFramebufferMetrics();
      return { telemetry, metrics };
    });
    await page.screenshot({ path: path.join(CAPTURES_DIR, "01-void-swirl.png") });

    // 2. Capture Phase 02: Magnetic Capture
    await page.evaluate(() => {
      window.__TORUS_SCENE__.setState({
        paused: true,
        hudHidden: false,
        cameraPreset: "villarceau-oblique",
        cyclePhase: 0.24,
        simTime: 15.2,
        pulsePhase: 0.38,
        aperture: 1.6,
      });
    });
    await page.screenshot({ path: path.join(CAPTURES_DIR, "02-magnetic-capture.png") });

    // 3. Capture & measure Phase 04: Harmonic Resonance (Oblique for ring concentration comparison)
    const resonanceState = await page.evaluate(() => {
      const api = window.__TORUS_SCENE__;
      const telemetry = api.setState({
        paused: true,
        hudHidden: false,
        cameraPreset: "wide-void",
        cyclePhase: 0.64,
        simTime: 18.0,
        pulsePhase: 0.42,
        aperture: 1.8,
      });
      const metrics = api.sampleFramebufferMetrics();
      return { telemetry, metrics };
    });

    // Capture Hero Macro Grazing Rim View
    await page.evaluate(() => {
      window.__TORUS_SCENE__.setState({
        paused: true,
        hudHidden: false,
        cameraPreset: "macro-rim",
        cyclePhase: 0.64,
        simTime: 18.0,
        pulsePhase: 0.42,
        aperture: 1.3,
        focalDistance: 4.35,
      });
    });
    await page.screenshot({ path: path.join(CAPTURES_DIR, "03-harmonic-resonance-macro.png") });

    // 4. Capture Torus Eye Interior View
    await page.evaluate(() => {
      window.__TORUS_SCENE__.setState({
        paused: true,
        hudHidden: false,
        cameraPreset: "torus-eye",
        cyclePhase: 0.64,
        simTime: 19.4,
        pulsePhase: 0.61,
        aperture: 1.4,
        focalDistance: 3.85,
      });
    });
    await page.screenshot({ path: path.join(CAPTURES_DIR, "04-torus-eye-interior.png") });

    // 5. Capture Clean Full-Screen View (HUD Hidden)
    await page.evaluate(() => {
      window.__TORUS_SCENE__.setState({
        paused: true,
        hudHidden: true,
        cameraPreset: "villarceau-oblique",
        cyclePhase: 0.64,
        simTime: 18.0,
        pulsePhase: 0.42,
        aperture: 1.6,
      });
    });
    await page.screenshot({ path: path.join(CAPTURES_DIR, "05-clean-fullscreen-no-hud.png") });

    // 6. Measure Macro Bokeh DoF response: f/16.0 (deep focus) vs f/1.2 (shallow macro bokeh)
    const dofComparison = await page.evaluate(() => {
      const api = window.__TORUS_SCENE__;
      api.setState({
        paused: true,
        cameraPreset: "macro-rim",
        cyclePhase: 0.64,
        simTime: 18.0,
        pulsePhase: 0.42,
        focalDistance: 3.2,
        aperture: 16.0,
      });
      const dofSharpMetrics = api.sampleFramebufferMetrics();

      api.setState({
        aperture: 1.2,
      });
      const dofMacroMetrics = api.sampleFramebufferMetrics();
      return { dofSharpMetrics, dofMacroMetrics };
    });

    // 7. Measure Slow-Motion time-scale determinism
    const slowMoTest = await page.evaluate(() => {
      const api = window.__TORUS_SCENE__;
      const t0 = api.setState({ paused: true, simTime: 10.0, slowMoSpeed: 0.1 }).simTime;
      const t1 = api.stepSimulation(0.2).simTime;
      const slowMoDeltaSimTime = t1 - t0;

      const t2 = api.setState({ paused: true, simTime: 10.0, slowMoSpeed: 1.0 }).simTime;
      const t3 = api.stepSimulation(0.2).simTime;
      const normalDeltaSimTime = t3 - t2;

      return { slowMoDeltaSimTime, normalDeltaSimTime };
    });

    const snapshot = {
      consoleErrors,
      pageErrors,
      deprecationWarnings,
      telemetry: resonanceState.telemetry,
      voidState,
      resonanceState,
      dofSharpMetrics: dofComparison.dofSharpMetrics,
      dofMacroMetrics: dofComparison.dofMacroMetrics,
      slowMoDeltaSimTime: slowMoTest.slowMoDeltaSimTime,
      normalDeltaSimTime: slowMoTest.normalDeltaSimTime,
    };

    if (injectFailure) {
      snapshot.telemetry.goldenDustCount = 42; // Intentional defect injection
    }

    const gateResults = evaluateGateAssertions(snapshot);

    // G7: Self-test confirming evaluateGateAssertions detects an injected failure
    const syntheticBrokenSnapshot = structuredClone(snapshot);
    syntheticBrokenSnapshot.consoleErrors.push("Synthetic WebGL error");
    syntheticBrokenSnapshot.telemetry.goldenDustCount = 500;
    const syntheticEval = evaluateGateAssertions(syntheticBrokenSnapshot);
    const selfTestCaughtFailure =
      syntheticEval.find((g) => g.id === "G1_ZERO_CONSOLE_AND_SHADER_ERRORS")?.passed === false &&
      syntheticEval.find((g) => g.id === "G2_PARTICLE_AND_STRAND_SCALE")?.passed === false;

    gateResults.push({
      id: "G7_SELFTEST_CAN_FAIL",
      passed: selfTestCaughtFailure,
      measured: {
        caughtSyntheticG1Failure:
          syntheticEval.find((g) => g.id === "G1_ZERO_CONSOLE_AND_SHADER_ERRORS")?.passed === false,
        caughtSyntheticG2Failure:
          syntheticEval.find((g) => g.id === "G2_PARTICLE_AND_STRAND_SCALE")?.passed === false,
      },
      expected: "Gate evaluator rejects synthetic broken console and particle count inputs",
    });

    let allPassed = true;
    for (const g of gateResults) {
      const status = g.passed ? "PASS" : "FAIL";
      if (!g.passed) allPassed = false;
      console.log(`${status}  ${g.id}`);
      console.log(`      measured: ${JSON.stringify(g.measured)}`);
      console.log(`      expected: ${g.expected}`);
    }

    const summaryPath = path.join(CAPTURES_DIR, "gate-results.json");
    fs.writeFileSync(summaryPath, JSON.stringify({ allPassed, gateResults }, null, 2));
    console.log(`GATE_SUITE_COMPLETE allPassed=${allPassed} count=${gateResults.length}`);

    if (!allPassed) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

runVerification().catch((err) => {
  console.error("FATAL_VERIFICATION_ERROR:", err);
  process.exit(1);
});
