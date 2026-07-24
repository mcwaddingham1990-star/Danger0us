/*
  Sound system built on the Web Audio API — everything here is synthesized
  in-browser, no external audio files required.

  Background music: there is no way to synthesize a real recorded piano
  performance from oscillators, so this generates a sparse, slow sequence
  of decaying plucked "piano-like" notes in a minor key over a very quiet
  sustained drone, run through a procedural reverb for atmosphere — a
  haunting ambient bed, not a real piano recording. If a real track is
  placed at live/audio/bgm.mp3 (or .ogg), it automatically takes over and
  this stops.
*/

const DrAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let reverb = null;
  let reverbWet = null;
  let ambienceGain = null;
  let ambienceRunning = false;
  let ambienceTimer = null;
  let droneOsc = null;
  let muted = false;
  let realMusicEl = null;

  // A minor pentatonic-ish, dark register
  const NOTE_SCALE = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392.0];

  // Cached soft-clip curve used to drive the sub-bass hits into
  // distortion for a thicker, more "cinematic impact" punch.
  let distortionCurve = null;
  function getDistortionCurve() {
    if (distortionCurve) return distortionCurve;
    const amount = 55;
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    distortionCurve = curve;
    return curve;
  }

  function makeImpulse(duration, decay) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.9;
      masterGain.connect(ctx.destination);

      reverb = ctx.createConvolver();
      reverb.buffer = makeImpulse(2.6, 2.5);
      reverbWet = ctx.createGain();
      reverbWet.gain.value = 0.35;
      reverb.connect(reverbWet).connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Sends a signal to both the dry master bus and the reverb bus.
  function connectWithReverb(node, dryLevel) {
    const dry = ctx.createGain();
    dry.gain.value = dryLevel != null ? dryLevel : 1;
    node.connect(dry).connect(masterGain);
    node.connect(reverb);
  }

  function envGain(duration, peak, attack) {
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + (attack || 0.02));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    return g;
  }

  function noiseBuffer(duration) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noiseBurst(duration, filterFreq, peak, filterType) {
    ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || "lowpass";
    filter.frequency.value = filterFreq || 800;
    const g = envGain(duration, peak || 0.35, 0.01);
    src.connect(filter).connect(g);
    connectWithReverb(g, 0.9);
    src.start();
  }

  function tone(freq, duration, type, peak, attack) {
    ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    const g = envGain(duration, peak || 0.3, attack);
    osc.connect(g);
    connectWithReverb(g, 0.85);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  // A single plucked, piano-like note: fundamental + a couple of quiet
  // harmonics through a filter that darkens as the note decays.
  function pianoNote(freq, peak, duration) {
    ensureCtx();
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + duration);
    filter.Q.value = 0.4;

    g.connect(filter);
    connectWithReverb(filter, 0.7);

    [1, 2, 3.01].forEach((mult, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.value = freq * mult;
      const partialGain = ctx.createGain();
      partialGain.gain.value = i === 0 ? 1 : 0.16 / i;
      osc.connect(partialGain).connect(g);
      osc.start(now);
      osc.stop(now + duration + 0.1);
    });
  }

  function spinStart() {
    ensureCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.4);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.4);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(filter).connect(g);
    connectWithReverb(g, 0.8);
    osc.start(now);
    osc.stop(now + 0.5);

    noiseBurst(0.3, 1800, 0.08, "highpass");
  }

  function reelStop() {
    ensureCtx();
    const now = ctx.currentTime;

    // Low mechanical thunk — the reel hitting its stop.
    const thunkOsc = ctx.createOscillator();
    thunkOsc.type = "triangle";
    const thunkFreq = 70 + Math.random() * 20;
    thunkOsc.frequency.setValueAtTime(thunkFreq * 2.2, now);
    thunkOsc.frequency.exponentialRampToValueAtTime(thunkFreq, now + 0.08);
    const thunkGain = ctx.createGain();
    thunkGain.gain.setValueAtTime(0.0001, now);
    thunkGain.gain.exponentialRampToValueAtTime(0.4, now + 0.008);
    thunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    thunkOsc.connect(thunkGain);
    connectWithReverb(thunkGain, 0.7);
    thunkOsc.start(now);
    thunkOsc.stop(now + 0.2);

    // Bright metallic click on top for definition.
    const freq = 900 + Math.random() * 300;
    tone(freq, 0.06, "square", 0.1, 0.002);
    noiseBurst(0.08, 3200, 0.14, "highpass");
  }

  function winChime(tierIndex) {
    const base = 523.3 * Math.pow(2, (tierIndex || 0) * 0.16); // C5 climbing by tier
    [0, 4, 7, 12].forEach((semi, i) => {
      setTimeout(() => pianoNote(base * Math.pow(2, semi / 12), 0.22, 1.1), i * 70);
    });
    // Sparkly high shimmer layered on top for a "cool" glint.
    [24, 28, 31].forEach((semi, i) => {
      setTimeout(() => pianoNote(base * Math.pow(2, semi / 12), 0.08, 0.6), 60 + i * 40);
    });
  }

  // intensity: roughly the cluster size, used to scale how big the bang is.
  // chained: internal flag set on secondary chain-reaction hits so they
  // don't spawn further chains of their own.
  function explosion(intensity, chained) {
    ensureCtx();
    const now = ctx.currentTime;
    const power = Math.min(1, 0.65 + (intensity || 5) / 26);

    // Sharp double-crack transient — the initial detonation snap.
    noiseBurst(0.045, 5200, 0.55 * power, "highpass");
    noiseBurst(0.09, 2600, 0.32 * power, "highpass");

    // Punchy sub-bass boom, driven through soft distortion for weight
    // and grit — this is the "you feel it in your chest" layer.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(150, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.5);
    const shaper = ctx.createWaveShaper();
    shaper.curve = getDistortionCurve();
    shaper.oversample = "4x";
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.9 * power, now + 0.012);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    sub.connect(shaper).connect(subGain);
    connectWithReverb(subGain, 0.85);
    sub.start(now);
    sub.stop(now + 0.65);

    // A second, slightly detuned low oscillator underneath for thickness.
    const sub2 = ctx.createOscillator();
    sub2.type = "triangle";
    sub2.frequency.setValueAtTime(138, now);
    sub2.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    const sub2Gain = ctx.createGain();
    sub2Gain.gain.setValueAtTime(0.0001, now);
    sub2Gain.gain.exponentialRampToValueAtTime(0.5 * power, now + 0.016);
    sub2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    sub2.connect(sub2Gain);
    connectWithReverb(sub2Gain, 0.85);
    sub2.start(now);
    sub2.stop(now + 0.6);

    // Rolling fireball body/rumble — longer and darker than before so
    // the blast has real trailing weight instead of just cutting off.
    noiseBurst(0.65, 480, 0.5 * power, "lowpass");
    noiseBurst(0.95, 200, 0.32 * power, "lowpass");

    // Bright metallic shrapnel ring for a sharp, "cool" glint on top.
    const ringOsc = ctx.createOscillator();
    ringOsc.type = "triangle";
    ringOsc.frequency.value = 1400 + Math.random() * 600;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.0001, now);
    ringGain.gain.exponentialRampToValueAtTime(0.16 * power, now + 0.01);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    ringOsc.connect(ringGain);
    connectWithReverb(ringGain, 0.6);
    ringOsc.start(now);
    ringOsc.stop(now + 0.28);

    // Debris/embers crackling down after the blast.
    const debrisCount = 4 + Math.floor(power * 6);
    for (let i = 0; i < debrisCount; i++) {
      const delay = 80 + Math.random() * 520;
      setTimeout(() => {
        noiseBurst(0.03 + Math.random() * 0.03, 2200 + Math.random() * 3000, 0.09 * power, "highpass");
      }, delay);
    }

    // Big clusters chain-react into one or two secondary kabooms, like a
    // string of blockbuster demolition charges going off in sequence.
    if (!chained && (intensity || 0) >= 8) {
      setTimeout(() => explosion(Math.max(3, Math.round((intensity || 8) * 0.6)), true), 110);
    }
    if (!chained && (intensity || 0) >= 16) {
      setTimeout(() => explosion(Math.max(3, Math.round((intensity || 16) * 0.4)), true), 240);
    }
  }

  function bonusTrigger() {
    ensureCtx();
    // A cinematic detonation announces the bonus before the fanfare hits.
    explosion(14);
    [0, 3, 6, 10, 12].forEach((semi, i) => {
      setTimeout(() => {
        tone(146.8 * Math.pow(2, semi / 12), 0.9, "sawtooth", 0.14, 0.05);
      }, 120 + i * 150);
    });
    setTimeout(() => noiseBurst(1.2, 1200, 0.15, "bandpass"), 400);
  }

  function jackpot() {
    ensureCtx();
    // Huge opening boom — the "screen shake" moment — before the
    // triumphant fanfare rings out over the top.
    explosion(28);
    setTimeout(() => {
      [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
        setTimeout(() => pianoNote(261.6 * Math.pow(2, semi / 12), 0.26, 1.3), i * 100);
      });
    }, 140);
  }

  function scheduleAmbience() {
    if (!ambienceRunning) return;
    const freq = NOTE_SCALE[Math.floor(Math.random() * NOTE_SCALE.length)] / 2;
    pianoNote(freq, 0.055, 3.5 + Math.random() * 1.5);
    const nextIn = 2800 + Math.random() * 3200;
    ambienceTimer = setTimeout(scheduleAmbience, nextIn);
  }

  function startAmbience() {
    if (ambienceRunning || realMusicEl) return;
    ensureCtx();
    ambienceRunning = true;

    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0;
    ambienceGain.connect(masterGain);
    ambienceGain.gain.linearRampToValueAtTime(muted ? 0 : 0.5, ctx.currentTime + 2);

    droneOsc = ctx.createOscillator();
    droneOsc.type = "sine";
    droneOsc.frequency.value = 55; // low A
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneOsc.connect(droneGain).connect(ambienceGain);
    droneOsc.start();

    scheduleAmbience();
  }

  function stopAmbience() {
    ambienceRunning = false;
    if (ambienceTimer) clearTimeout(ambienceTimer);
    if (droneOsc) { try { droneOsc.stop(); } catch (e) {} }
    droneOsc = null;
  }

  function tryLoadRealMusic() {
    const el = document.createElement("audio");
    el.src = "audio/bgm.mp3";
    el.loop = true;
    el.volume = muted ? 0 : 0.35;
    el.addEventListener("canplaythrough", () => {
      realMusicEl = el;
      stopAmbience();
      el.play().catch(() => {});
    }, { once: true });
    el.addEventListener("error", () => {
      startAmbience();
    }, { once: true });
  }

  function start() {
    ensureCtx();
    if (!realMusicEl && !ambienceRunning) tryLoadRealMusic();
  }

  function setMuted(next) {
    muted = next;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.9;
    if (ambienceGain) ambienceGain.gain.value = muted ? 0 : 0.5;
    if (realMusicEl) realMusicEl.volume = muted ? 0 : 0.35;
  }

  function isMuted() { return muted; }

  return {
    start, setMuted, isMuted,
    spinStart, reelStop, winChime, explosion, bonusTrigger, jackpot,
  };
})();
