/*
  AudioManager for Dangerous Rides.

  Deliberately minimal: ambience-loop scenes for login/lobby, a one-off
  sting for the sign-in button, and — on the game screen — exactly one
  looping ambience bed and nothing else. No sound effects are wired to
  gameplay events (spins, wins, cascades, bonuses, jackpots, UI clicks);
  the game screen only ever makes the sound of its ambience loop.

  Every sound is declared once in MANIFEST as a `pool` of sample basenames
  under live/audio/sfx/<name>.mp3, picked at random with no immediate
  repeat. Buffers are fetched once and cached forever.
*/

const AudioManager = (() => {
  const SFX_DIR = "audio/sfx/";
  const MUSIC_DIR = "audio/music/";

  let ctx = null;
  let masterGain, ambBus, musicBus;
  let muted = false;
  let musicVolume = 0.55;

  const bufferCache = {}; // "dir+name" -> Promise<AudioBuffer|null>
  const lastPlayed = {};  // manifest key -> last file name picked (no-repeat)

  const MANIFEST = {
    // ---- Ambience (login / lobby / game) ----
    drone: { pool: ["drone1", "drone2", "drone3", "drone4", "drone5", "drone6", "drone7", "drone8", "drone9"] },
    wind: { pool: ["wind-howl", "wind-blow2", "cinematic-wind"] },
    thunder: { pool: ["thunder1", "thunder2", "thunder-rumble", "thunder-cinematic", "thunder-bass"] },
    raven: { pool: ["crow-caw", "bird-raven-caw"] },
    metal_rattle: { pool: ["metal-rattle"] },
    horror_stinger: { pool: ["horror1", "horror2", "horror3", "horror4", "horror5", "horror6", "horror7", "horror8", "horror9", "horror10", "horror11", "horror12", "horror13", "horror14", "horror15"] },
    heartbeat: { pool: ["heartbeat"] },

    // ---- Sign-in button press ----
    electric_large: { pool: ["electric-charge", "electric-whoosh"] },
    electric_arc: { pool: ["electric-zap", "magic1", "magic5"] },
    explosion_small: { pool: ["impact-loud", "battle-boom"] },
  };

  // ---- Core engine ------------------------------------------------------

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      ambBus = ctx.createGain(); ambBus.gain.value = 0.9 * 0.8; ambBus.connect(masterGain);
      musicBus = ctx.createGain(); musicBus.gain.value = musicVolume; musicBus.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function loadBuffer(dir, name, ext) {
    const key = dir + name;
    if (bufferCache[key]) return bufferCache[key];
    bufferCache[key] = fetch(dir + name + "." + (ext || "mp3"))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    return bufferCache[key];
  }

  function allManifestNames() {
    const names = new Set();
    Object.values(MANIFEST).forEach((entry) => (entry.pool || []).forEach((n) => names.add(n)));
    return Array.from(names);
  }

  // Preloads every real sample file declared in the manifest pools, in
  // small concurrency-limited batches during browser idle time.
  function preloadAll() {
    ensureCtx();
    const names = allManifestNames();
    const BATCH = 6;
    let i = 0;
    function next() {
      const batch = names.slice(i, i + BATCH);
      i += BATCH;
      if (batch.length === 0) return;
      Promise.all(batch.map((n) => loadBuffer(SFX_DIR, n))).then(() => {
        if ("requestIdleCallback" in window) requestIdleCallback(next, { timeout: 2000 });
        else setTimeout(next, 60);
      });
    }
    next();
  }

  function pickFromPool(manifestKey, pool) {
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    let choice;
    do {
      choice = pool[Math.floor(Math.random() * pool.length)];
    } while (choice === lastPlayed[manifestKey]);
    lastPlayed[manifestKey] = choice;
    return choice;
  }

  function playBuffer(buffer, opts) {
    opts = opts || {};
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = opts.rate || 1;
    const g = ctx.createGain();
    const peak = opts.gain != null ? opts.gain : 1;
    g.gain.value = peak;
    src.connect(g).connect(opts.bus || ambBus);
    const startAt = ctx.currentTime + (opts.delay || 0);
    src.start(startAt);
    if (opts.stopAt) {
      const fadeStart = startAt + Math.max(0.05, opts.stopAt - 0.12);
      g.gain.setValueAtTime(peak, fadeStart);
      g.gain.linearRampToValueAtTime(0.0001, startAt + opts.stopAt);
      src.stop(startAt + opts.stopAt + 0.05);
    }
    return src;
  }

  // Plays one manifest key: a random (no-immediate-repeat) pick from its
  // pool, or nothing if the pool is empty.
  function play(manifestKey, opts) {
    opts = opts || {};
    ensureCtx();
    const entry = MANIFEST[manifestKey];
    if (!entry) return Promise.resolve(null);
    const file = pickFromPool(manifestKey, entry.pool || []);
    if (!file) return Promise.resolve(null);
    return loadBuffer(SFX_DIR, file).then((buffer) => (buffer ? playBuffer(buffer, opts) : null));
  }

  // Plays several manifest keys layered together with relative timing.
  function layer(list) {
    (list || []).forEach((spec) => play(spec.key, spec));
  }

  function startLoop(manifestKey, opts) {
    opts = opts || {};
    ensureCtx();
    const token = { stopped: false };
    const entry = MANIFEST[manifestKey];
    const file = entry ? pickFromPool(manifestKey, entry.pool || []) : null;
    if (!file) return token;
    loadBuffer(SFX_DIR, file).then((buffer) => {
      if (!buffer || token.stopped) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.playbackRate.value = opts.rate || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(opts.gain != null ? opts.gain : 0.3, ctx.currentTime + (opts.fadeIn != null ? opts.fadeIn : 1.5));
      src.connect(g).connect(opts.bus || ambBus);
      src.start();
      token.source = src;
      token.gain = g;
    });
    return token;
  }

  function stopLoop(token, fadeOut) {
    if (!token || token.stopped) return;
    token.stopped = true;
    if (token.source && token.gain) {
      const now = ctx.currentTime;
      const g = token.gain;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + (fadeOut != null ? fadeOut : 1.2));
      try { token.source.stop(now + (fadeOut != null ? fadeOut : 1.2) + 0.05); } catch (e) {}
    }
  }

  function schedulePeriodic(fn, minMs, maxMs) {
    let cancelled = false;
    let timer = null;
    function tick() {
      if (cancelled) return;
      fn();
      timer = setTimeout(tick, minMs + Math.random() * Math.max(0, maxMs - minMs));
    }
    timer = setTimeout(tick, Math.random() * minMs);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }

  // ---- Ambience scenes ---------------------------------------------

  const SCENES = {
    login: {
      loops: [
        { key: "drone", gain: 0.28 },
        { key: "wind", gain: 0.16 },
      ],
      periodic: [
        () => schedulePeriodic(() => play("thunder", { gain: 0.5, bus: ambBus }), 25000, 55000),
        () => schedulePeriodic(() => play("raven", { gain: 0.3, bus: ambBus }), 30000, 60000),
        () => schedulePeriodic(() => play("metal_rattle", { gain: 0.28, bus: ambBus }), 24000, 45000),
        () => schedulePeriodic(() => play("horror_stinger", { gain: 0.16, bus: ambBus, stopAt: 2.5 }), 50000, 100000),
        () => schedulePeriodic(() => play("heartbeat", { gain: 0.35, rate: 0.9, bus: ambBus }), 45000, 90000),
      ],
    },
    lobby: {
      loops: [
        { key: "drone", gain: 0.28 },
        { key: "wind", gain: 0.16 },
      ],
      periodic: [
        () => schedulePeriodic(() => play("thunder", { gain: 0.5, bus: ambBus }), 25000, 55000),
        () => schedulePeriodic(() => play("raven", { gain: 0.3, bus: ambBus }), 30000, 60000),
        () => schedulePeriodic(() => play("metal_rattle", { gain: 0.28, bus: ambBus }), 24000, 45000),
        () => schedulePeriodic(() => play("horror_stinger", { gain: 0.16, bus: ambBus, stopAt: 2.5 }), 50000, 100000),
        () => schedulePeriodic(() => play("heartbeat", { gain: 0.35, rate: 0.9, bus: ambBus }), 45000, 90000),
      ],
      // No generative pulse bed — matches the sign-in screen for now.
      // Drop a real track at live/audio/music/lobby_theme.mp3 and it
      // takes over automatically, no code changes needed.
      music: "lobby_theme",
    },
    // The game screen's entire sound is this one ambience loop — no
    // periodic stingers, no SFX tied to spins/wins/bonuses/UI. Nothing
    // else is ever wired to play here.
    game: {
      loops: [
        { key: "drone", gain: 0.2 },
      ],
    },
  };

  let currentSceneName = null;
  let activeLoopTokens = [];
  let activeTimerCancels = [];

  // ---- Music (crossfading, real files only — no generative fallback) --

  let currentMusicKey = null;
  const realMusicEls = {};
  const customTracks = {};

  // Real tracks layered ON TOP of a scene's ambience (not swapped in) —
  // e.g. a real song playing alongside the drone/wind bed rather than
  // replacing it. Keyed by filename under live/audio/music/.
  function startCustomTrack(filename, opts) {
    opts = opts || {};
    if (customTracks[filename]) return;
    ensureCtx();
    const el = new Audio(MUSIC_DIR + filename);
    el.loop = true;
    el.volume = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(opts.gain != null ? opts.gain : 0.4, ctx.currentTime + (opts.fadeIn != null ? opts.fadeIn : 2.5));
    try {
      const src = ctx.createMediaElementSource(el);
      src.connect(g).connect(musicBus);
    } catch (e) {}
    el.play().catch(() => {});
    customTracks[filename] = { el, gain: g };
  }

  function stopCustomTrack(filename, fadeMs) {
    const entry = customTracks[filename];
    if (!entry) return;
    delete customTracks[filename];
    const now = ctx.currentTime;
    const ms = fadeMs != null ? fadeMs : 1500;
    entry.gain.gain.cancelScheduledValues(now);
    entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
    entry.gain.gain.linearRampToValueAtTime(0.0001, now + ms / 1000);
    setTimeout(() => { try { entry.el.pause(); } catch (e) {} }, ms + 100);
  }

  function fadeMusicOut(ms) {
    if (!musicBus) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(0.0001, now + ms / 1000);
  }

  function fadeMusicIn(ms) {
    if (!musicBus) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(0.0001, now);
    musicBus.gain.linearRampToValueAtTime(musicVolume, now + ms / 1000);
  }

  // Uses a real file at audio/music/<key>.mp3 if present; otherwise a
  // graceful no-op (no generative fallback).
  function tryMusicOverride(musicKey) {
    const el = new Audio(MUSIC_DIR + musicKey + ".mp3");
    el.loop = true;
    el.addEventListener("canplaythrough", () => {
      if (currentMusicKey !== musicKey || realMusicEls[musicKey]) return;
      ensureCtx();
      try {
        const src = ctx.createMediaElementSource(el);
        src.connect(musicBus);
      } catch (e) {}
      el.volume = 1;
      el.play().catch(() => {});
      realMusicEls[musicKey] = el;
    }, { once: true });
  }

  function playMusic(musicKey, opts) {
    opts = opts || {};
    const fadeMs = opts.fadeMs != null ? opts.fadeMs : 1200;
    if (currentMusicKey === musicKey) return;
    ensureCtx();
    fadeMusicOut(fadeMs * 0.5);
    setTimeout(() => {
      const prev = currentMusicKey;
      if (prev && realMusicEls[prev]) { try { realMusicEls[prev].pause(); } catch (e) {} delete realMusicEls[prev]; }
      currentMusicKey = musicKey;
      fadeMusicIn(fadeMs * 0.5);
      tryMusicOverride(musicKey);
    }, fadeMs * 0.5);
  }

  function stopMusic(fadeMs) {
    fadeMusicOut(fadeMs != null ? fadeMs : 1200);
    setTimeout(() => {
      if (currentMusicKey && realMusicEls[currentMusicKey]) { try { realMusicEls[currentMusicKey].pause(); } catch (e) {} delete realMusicEls[currentMusicKey]; }
      currentMusicKey = null;
    }, fadeMs != null ? fadeMs : 1200);
  }

  function enterScene(name) {
    if (currentSceneName === name) return;
    exitScene();
    const scene = SCENES[name];
    if (!scene) return;
    ensureCtx();
    currentSceneName = name;
    activeLoopTokens = (scene.loops || []).map((l) => startLoop(l.key, { gain: l.gain, bus: ambBus, fadeIn: 2 }));
    activeTimerCancels = (scene.periodic || []).map((fn) => fn());
    if (scene.music) playMusic(scene.music);
    else if (currentMusicKey) stopMusic(800);
  }

  function exitScene() {
    if (!currentSceneName) return;
    activeLoopTokens.forEach((t) => stopLoop(t, 1.0));
    activeLoopTokens = [];
    activeTimerCancels.forEach((c) => c());
    activeTimerCancels = [];
    currentSceneName = null;
  }

  // ---- Sign-in button press (the only one-off SFX left in the app) ----

  function signInPress() {
    layer([
      { key: "electric_large", gain: 0.6 },
      { key: "electric_arc", gain: 0.35, delay: 0.05, stopAt: 1.2 },
      { key: "explosion_small", gain: 0.55, delay: 0.08, stopAt: 1.4 },
    ]);
  }

  // Silent visual count-up — no tick sound. Used for the win counter.
  function animateCountUp(el, from, to, durationMs) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    if (Math.abs(diff) < 0.001) { el.textContent = to.toFixed(1); return; }
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      el.textContent = (from + diff * eased).toFixed(1);
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = to.toFixed(1);
    }
    requestAnimationFrame(frame);
  }

  // ---- Public setup / settings ---------------------------------------

  function start() {
    ensureCtx();
    preloadAll();
  }

  function setMuted(next) {
    muted = next;
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  }
  function isMuted() { return muted; }

  return {
    start, setMuted, isMuted,
    preloadAll, enterScene,
    signInPress,
    startCustomTrack, stopCustomTrack,
    animateCountUp,
  };
})();

// Backward-compatible alias — older call sites can keep using DrAudio.
const DrAudio = AudioManager;
