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
  function explosion(intensity) {
    ensureCtx();
    const now = ctx.currentTime;
    const power = Math.min(1, 0.55 + (intensity || 5) / 40);

    // Sharp crack transient — the initial "hit".
    noiseBurst(0.05, 4500, 0.4 * power, "highpass");

    // Sub-bass thump.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.55 * power, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(g);
    connectWithReverb(g, 0.9);
    osc.start(now);
    osc.stop(now + 0.45);

    // Body/rumble.
    noiseBurst(0.42, 550, 0.38 * power, "lowpass");

    // Bright metallic ring for a "magic" crack, brief and short-lived.
    const ringOsc = ctx.createOscillator();
    ringOsc.type = "triangle";
    ringOsc.frequency.value = 1400 + Math.random() * 500;
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.0001, now);
    ringGain.gain.exponentialRampToValueAtTime(0.12 * power, now + 0.01);
    ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    ringOsc.connect(ringGain);
    connectWithReverb(ringGain, 0.6);
    ringOsc.start(now);
    ringOsc.stop(now + 0.25);
  }

  function bonusTrigger() {
    ensureCtx();
    [0, 3, 6, 10, 12].forEach((semi, i) => {
      setTimeout(() => {
        tone(146.8 * Math.pow(2, semi / 12), 0.9, "sawtooth", 0.14, 0.05);
      }, i * 150);
    });
    setTimeout(() => noiseBurst(1.2, 1200, 0.15, "bandpass"), 300);
  }

  function jackpot() {
    ensureCtx();
    [0, 4, 7, 12, 16, 19, 24].forEach((semi, i) => {
      setTimeout(() => pianoNote(261.6 * Math.pow(2, semi / 12), 0.26, 1.3), i * 100);
    });
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
