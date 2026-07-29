/**
 * Audio analysis for the visualisers.
 *
 * Wraps an AnalyserNode behind a stable, allocation-free API and turns raw FFT
 * bins into features that are actually pleasant to drive graphics with:
 * log-spaced bands, envelope followers with fast attack / slow release, onset
 * detection via spectral flux, and automatic gain so a quiet master still
 * pushes the visuals to full range.
 *
 * The mobile case matters as much as the desktop one. Pulsar's Web Audio graph
 * is deliberately desktop-only — routing playback through it broke audio on
 * phones — so on every touch device `getAnalyser()` returns null. Rather than
 * let phone visuals sit dead, this synthesises a convincing musical motion:
 * a steady pulse with swung accents and independently drifting band energies.
 * It is clearly labelled as synthetic (`isSynthetic`) so nothing presents it as
 * measured data.
 */

export interface AudioFrame {
  /** Per-band energy, log-spaced low→high, each 0..1. */
  bands: Float32Array;
  /** Smoothed low-end energy, 0..1. */
  bass: number;
  /** Smoothed mid energy, 0..1. */
  mid: number;
  /** Smoothed high-end energy, 0..1. */
  treble: number;
  /** Overall loudness, 0..1. */
  level: number;
  /** Decays from 1 → 0 after each detected onset — use for punch/flash. */
  kick: number;
  /** Rises 0→1 across the gap between onsets; a phase clock for rhythmic motion. */
  beatPhase: number;
  /** Seconds since the engine started, advanced by real frame delta. */
  time: number;
  /** True when there is no analyser and the motion is generated, not measured. */
  isSynthetic: boolean;
}

export interface AudioEngineOptions {
  /** Number of log-spaced output bands. */
  bands?: number;
  /** Frames of history for the adaptive onset threshold. */
  fluxHistory?: number;
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export class AudioEngine {
  private readonly bandCount: number;
  private readonly frame: AudioFrame;

  // Reused every frame — the render loop must never allocate.
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private wave: Uint8Array<ArrayBuffer> | null = null;
  private prevSpectrum: Float32Array;
  private fluxWindow: Float32Array;
  private fluxIndex = 0;

  // Envelope state.
  private envBass = 0;
  private envMid = 0;
  private envTreble = 0;
  private envLevel = 0;
  private kickEnv = 0;

  // Automatic gain: track a decaying peak so quiet tracks still fill the range.
  private peak = 0.15;

  // Beat clock.
  private lastOnset = 0;
  private beatPeriod = 0.5; // seconds; seeded at 120bpm and adapted
  private t = 0;

  constructor(opts: AudioEngineOptions = {}) {
    this.bandCount = opts.bands ?? 48;
    this.prevSpectrum = new Float32Array(this.bandCount);
    this.fluxWindow = new Float32Array(opts.fluxHistory ?? 43); // ~0.7s at 60fps
    this.frame = {
      bands: new Float32Array(this.bandCount),
      bass: 0,
      mid: 0,
      treble: 0,
      level: 0,
      kick: 0,
      beatPhase: 0,
      time: 0,
      isSynthetic: true,
    };
  }

  /**
   * Advance one frame. `dt` is seconds since the previous call — pass the real
   * delta so motion is frame-rate independent (visuals run at 30fps on touch).
   */
  update(analyser: AnalyserNode | null, dt: number, playing: boolean): AudioFrame {
    const step = Math.min(Math.max(dt, 0.001), 0.1); // guard tab-switch spikes
    this.t += step;
    this.frame.time = this.t;

    if (analyser && playing) {
      this.frame.isSynthetic = false;
      this.analyse(analyser, step);
    } else {
      this.frame.isSynthetic = true;
      this.synthesise(step, playing);
    }
    return this.frame;
  }

  // ── real analysis ────────────────────────────────────────────
  private analyse(analyser: AnalyserNode, dt: number) {
    const bins = analyser.frequencyBinCount;
    if (!this.freq || this.freq.length !== bins) {
      this.freq = new Uint8Array(bins);
      this.wave = new Uint8Array(bins);
    }
    analyser.getByteFrequencyData(this.freq);
    analyser.getByteTimeDomainData(this.wave!);

    const f = this.freq;
    const n = this.bandCount;
    const bands = this.frame.bands;

    // Log-spaced binning: linear FFT bins waste most of their resolution on
    // frequencies we barely perceive as separate, which makes a linear
    // spectrum look flat and lifeless.
    let flux = 0;
    let sum = 0;
    // Only the lower ~72% of bins carry musical content worth showing.
    const usable = Math.floor(bins * 0.72);
    for (let i = 0; i < n; i++) {
      const lo = Math.floor(Math.pow(i / n, 1.7) * usable);
      const hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 1.7) * usable));
      let acc = 0;
      for (let k = lo; k < hi && k < bins; k++) acc += f[k];
      const v = acc / (hi - lo) / 255;
      bands[i] = v;
      sum += v;
      // Spectral flux = summed POSITIVE change only. Rising energy is an onset;
      // falling energy is just a note decaying.
      const d = v - this.prevSpectrum[i];
      if (d > 0) flux += d;
      this.prevSpectrum[i] = v;
    }

    // Auto-gain against a decaying peak.
    const raw = sum / n;
    this.peak = Math.max(raw, this.peak * (1 - 0.4 * dt));
    const gain = 1 / Math.max(this.peak, 0.04);

    const lowEnd = Math.floor(n * 0.14);
    const midEnd = Math.floor(n * 0.55);
    this.envelope(bands, 0, lowEnd, gain, dt, "bass");
    this.envelope(bands, lowEnd, midEnd, gain, dt, "mid");
    this.envelope(bands, midEnd, n, gain, dt, "treble");

    this.frame.level = this.follow(this.envLevel, clamp01(raw * gain), dt, 22, 4);
    this.envLevel = this.frame.level;

    this.detectOnset(flux, dt);
  }

  private envelope(
    bands: Float32Array,
    from: number,
    to: number,
    gain: number,
    dt: number,
    which: "bass" | "mid" | "treble"
  ) {
    let acc = 0;
    for (let i = from; i < to; i++) acc += bands[i];
    const target = clamp01((acc / Math.max(1, to - from)) * gain);
    // Bass reads better slightly slower; treble needs to sparkle.
    const [atk, rel] =
      which === "bass" ? [26, 5] : which === "mid" ? [30, 6] : [38, 9];
    if (which === "bass") this.frame.bass = this.envBass = this.follow(this.envBass, target, dt, atk, rel);
    else if (which === "mid") this.frame.mid = this.envMid = this.follow(this.envMid, target, dt, atk, rel);
    else this.frame.treble = this.envTreble = this.follow(this.envTreble, target, dt, atk, rel);
  }

  /** Asymmetric one-pole follower: snaps up, eases down. */
  private follow(current: number, target: number, dt: number, attack: number, release: number) {
    const rate = target > current ? attack : release;
    return current + (target - current) * Math.min(1, rate * dt);
  }

  /**
   * Onset detection with an adaptive threshold: an onset is flux that stands
   * clearly above the recent local average, so it tracks the track's own
   * dynamics instead of a fixed level that only suits one master.
   */
  private detectOnset(flux: number, dt: number) {
    this.fluxWindow[this.fluxIndex] = flux;
    this.fluxIndex = (this.fluxIndex + 1) % this.fluxWindow.length;

    let mean = 0;
    for (let i = 0; i < this.fluxWindow.length; i++) mean += this.fluxWindow[i];
    mean /= this.fluxWindow.length;

    const sinceLast = this.t - this.lastOnset;
    // 110ms refractory period stops one transient firing several times.
    if (flux > mean * 1.55 && flux > 0.02 && sinceLast > 0.11) {
      // Only adapt the period on plausible musical intervals (40–200bpm).
      if (sinceLast > 0.3 && sinceLast < 1.5) {
        this.beatPeriod += (sinceLast - this.beatPeriod) * 0.18;
      }
      this.lastOnset = this.t;
      this.kickEnv = 1;
    }

    this.kickEnv = Math.max(0, this.kickEnv - dt * 3.4);
    this.frame.kick = this.kickEnv;
    this.frame.beatPhase = clamp01((this.t - this.lastOnset) / Math.max(0.15, this.beatPeriod));
  }

  // ── synthesised motion (no analyser: every touch device) ─────
  private synthesise(dt: number, playing: boolean) {
    const n = this.bandCount;
    const bands = this.frame.bands;
    // Idle when nothing is playing: a slow, calm drift rather than a fake beat.
    const drive = playing ? 1 : 0.35;
    const bpm = 112;
    const period = 60 / bpm;

    const phase = (this.t % period) / period;
    if (playing && phase < dt / period) {
      this.lastOnset = this.t;
      this.kickEnv = 1;
    }
    this.kickEnv = Math.max(0, this.kickEnv - dt * (playing ? 3.0 : 1.2));

    // Layered sines at incommensurate rates so the bands never visibly loop.
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const a = Math.sin(this.t * (1.1 + p * 2.3) + i * 0.55);
      const b = Math.sin(this.t * (0.37 + p * 0.9) + i * 1.7);
      const tilt = Math.pow(1 - p, 1.5); // real spectra fall off toward treble
      bands[i] = clamp01((0.30 + 0.26 * a + 0.18 * b) * tilt * drive + this.kickEnv * tilt * 0.34);
    }

    const bassT = clamp01((0.34 + 0.3 * Math.sin(this.t * 1.9)) * drive + this.kickEnv * 0.5);
    const midT = clamp01((0.30 + 0.22 * Math.sin(this.t * 1.3 + 1.1)) * drive);
    const trebT = clamp01((0.24 + 0.22 * Math.sin(this.t * 2.7 + 2.2)) * drive);

    this.frame.bass = this.envBass = this.follow(this.envBass, bassT, dt, 20, 5);
    this.frame.mid = this.envMid = this.follow(this.envMid, midT, dt, 22, 6);
    this.frame.treble = this.envTreble = this.follow(this.envTreble, trebT, dt, 26, 8);
    this.frame.level = this.envLevel = this.follow(
      this.envLevel,
      (bassT + midT + trebT) / 3,
      dt,
      18,
      4
    );
    this.frame.kick = this.kickEnv;
    this.frame.beatPhase = phase;
  }
}
