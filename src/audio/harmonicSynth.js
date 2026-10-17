/**
 * @fileoverview Optional Web Audio API procedural harmonic synthesizer synchronized to the
 * bioluminescent electric blue & magenta light waves and slow-motion time scale.
 */

export class HarmonicSynth {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.droneOscA = null;
    this.droneOscB = null;
    this.pulseOscBlue = null;
    this.pulseOscMagenta = null;
    this.pulseGainBlue = null;
    this.pulseGainMagenta = null;
    this.filterNode = null;
  }

  initContext() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0;

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 420.0;
    this.filterNode.Q.value = 3.2;

    // Deep toroidal sub-bass drone (D2 = 73.42 Hz + A2 = 110.0 Hz harmonic fifth)
    this.droneOscA = this.ctx.createOscillator();
    this.droneOscA.type = "sine";
    this.droneOscA.frequency.value = 73.42;

    this.droneOscB = this.ctx.createOscillator();
    this.droneOscB.type = "triangle";
    this.droneOscB.frequency.value = 110.0;

    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.24;

    // Electric-blue harmonic resonator (F#4 = 369.99 Hz)
    this.pulseOscBlue = this.ctx.createOscillator();
    this.pulseOscBlue.type = "sine";
    this.pulseOscBlue.frequency.value = 369.99;
    this.pulseGainBlue = this.ctx.createGain();
    this.pulseGainBlue.gain.value = 0.04;

    // Bioluminescent-magenta harmonic resonator (A4 = 440.0 Hz)
    this.pulseOscMagenta = this.ctx.createOscillator();
    this.pulseOscMagenta.type = "sine";
    this.pulseOscMagenta.frequency.value = 440.0;
    this.pulseGainMagenta = this.ctx.createGain();
    this.pulseGainMagenta.gain.value = 0.04;

    this.droneOscA.connect(droneGain);
    this.droneOscB.connect(droneGain);
    droneGain.connect(this.filterNode);

    this.pulseOscBlue.connect(this.pulseGainBlue);
    this.pulseOscMagenta.connect(this.pulseGainMagenta);
    this.pulseGainBlue.connect(this.filterNode);
    this.pulseGainMagenta.connect(this.filterNode);

    this.filterNode.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    this.droneOscA.start(now);
    this.droneOscB.start(now);
    this.pulseOscBlue.start(now);
    this.pulseOscMagenta.start(now);
  }

  toggle() {
    this.initContext();
    if (!this.ctx) return false;

    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.enabled ? 0.22 : 0.0, now, 0.18);
    return this.enabled;
  }

  update(coalescence, pulsePhase, slowMoSpeed) {
    if (!this.enabled || !this.ctx || !this.filterNode) return;

    const now = this.ctx.currentTime;
    const twoPi = Math.PI * 2.0;
    const blueCrest = 0.5 + 0.5 * Math.sin(pulsePhase * twoPi * 2.0);
    const magCrest = 0.5 + 0.5 * Math.cos(pulsePhase * twoPi * 1.5);

    const cutoff = 240.0 + coalescence * 860.0 + blueCrest * 320.0 * Math.min(1.5, slowMoSpeed + 0.4);
    this.filterNode.frequency.setTargetAtTime(cutoff, now, 0.06);

    this.pulseGainBlue.gain.setTargetAtTime(0.02 + 0.09 * Math.pow(blueCrest, 2.0) * coalescence, now, 0.05);
    this.pulseGainMagenta.gain.setTargetAtTime(0.02 + 0.08 * Math.pow(magCrest, 2.0) * coalescence, now, 0.05);
  }
}
