/*
  Lightweight sound system built on the Web Audio API — no external audio
  files required for the sound effects, everything is synthesized.

  Background music is a separate story: this file also generates a soft
  synthesized "eerie pad" ambience as a placeholder loop, because there is
  no way to synthesize a convincing horror-piano performance from pure
  oscillators — that needs an actual recorded/composed track. If a real
  file is dropped at live/audio/bgm.mp3 (or .ogg), it takes over
  automatically and the synthesized ambience stops.
*/

const DrAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let ambienceGain = null;
  let ambienceNodes = [];
  let ambienceRunning = false;
  let muted = false;
  let realMusicEl = null;

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 0.8;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function envGain(duration, peak) {
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + Math.min(0.03, duration * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    return g;
  }

  function tone(freq, duration, type, peak) {
    ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    const g = envGain(duration, peak || 0.3);
    osc.connect(g).connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  function noiseBurst(duration, filterFreq, peak) {
    ensureCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq || 800;
    const g = envGain(duration, peak || 0.35);
    src.connect(filter).connect(g).connect(masterGain);
    src.start();
  }

  function spinStart() {
    ensureCtx();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.18, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(g).connect(masterGain);
    osc.start();
    osc.stop(now + 0.45);
  }

  function reelStop() {
    tone(220, 0.09, "square", 0.15);
  }

  function winChime(tierIndex) {
    ensureCtx();
    const base = 440 + (tierIndex || 0) * 120;
    [0, 4, 7].forEach((semi, i) => {
      setTimeout(() => tone(base * Math.pow(2, semi / 12), 0.5, "sine", 0.18), i * 60);
    });
  }

  function explosion() {
    noiseBurst(0.35, 500, 0.3);
  }

  function bonusTrigger() {
    ensureCtx();
    [0, 3, 6, 10].forEach((semi, i) => {
      setTimeout(() => tone(180 * Math.pow(2, semi / 12), 0.6, "sawtooth", 0.15), i * 130);
    });
  }

  function jackpot() {
    ensureCtx();
    [0, 4, 7, 12, 16].forEach((semi, i) => {
      setTimeout(() => tone(300 * Math.pow(2, semi / 12), 0.7, "triangle", 0.22), i * 110);
    });
  }

  function startAmbience() {
    if (ambienceRunning || realMusicEl) return;
    ensureCtx();
    ambienceRunning = true;
    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = muted ? 0 : 0.12;
    ambienceGain.connect(masterGain);

    // Slow, detuned minor-key drone with a soft tremolo — a placeholder
    // "eerie pad" until a real piano track is supplied.
    const notes = [110, 130.8, 164.8]; // A2, C3, E3 minor triad
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 6;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12 + i * 0.03;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(ambienceGain.gain);
      lfo.start();

      osc.connect(ambienceGain);
      osc.start();
      ambienceNodes.push(osc, lfo);
    });
  }

  function stopAmbience() {
    ambienceNodes.forEach((n) => { try { n.stop(); } catch (e) {} });
    ambienceNodes = [];
    ambienceRunning = false;
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
      // no real track present — fall back to synthesized ambience
      startAmbience();
    }, { once: true });
  }

  function start() {
    ensureCtx();
    tryLoadRealMusic();
  }

  function setMuted(next) {
    muted = next;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.8;
    if (ambienceGain) ambienceGain.gain.value = muted ? 0 : 0.12;
    if (realMusicEl) realMusicEl.volume = muted ? 0 : 0.35;
  }

  function isMuted() { return muted; }

  return {
    start, setMuted, isMuted,
    spinStart, reelStop, winChime, explosion, bonusTrigger, jackpot,
  };
})();
