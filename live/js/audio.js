/*
  AudioManager for Dangerous Rides.

  A centralized, manifest-driven sound system. Every sound is declared once
  in MANIFEST as either:
    - a `pool` of real sample files (randomized, never repeats the same
      file twice in a row) built from the Mixkit library, and/or
    - an `override` slot — a single custom file path. If present it always
      wins over the pool, so dropping a real composed/recorded file in
      later (e.g. a real jackpot_finish.mp3) takes over with no code
      changes.
  A key with an empty pool and no override file present is a true
  placeholder: play() on it is a graceful no-op until a file exists.

  Everything is preloaded and cached (one fetch/decode per file, ever).
  Multiple sounds can overlap freely — every play() spawns its own
  BufferSource on a shared bus (sfx/amb/music/voice) so nothing steals
  another sound's playback. Music crossfades; ambience scenes loop.
*/

const AudioManager = (() => {
  const SFX_DIR = "audio/sfx/";
  const CUSTOM_DIR = "audio/custom/";
  const MUSIC_DIR = "audio/music/";
  const VOICE_DIR = "audio/voice/";

  let ctx = null;
  let masterGain, sfxBus, ambBus, musicBus, voiceBus;
  let muted = false;
  let musicVolume = 0.55;
  let effectsVolume = 0.9;
  let unlocked = false;

  const bufferCache = {}; // "dir+name" -> Promise<AudioBuffer|null>
  const lastPlayed = {};  // manifest key -> last file name picked (no-repeat)

  // ---- Manifest -------------------------------------------------------
  // pool: array of sample basenames under live/audio/sfx/<name>.mp3
  // override: single custom file under live/audio/custom/<key>.mp3
  // A key not listed here simply has no pool and no override — play()
  // still works, it just does nothing until you add files.
  const MANIFEST = {
    // ---- Login / ambience ----
    drone: { pool: ["drone1", "drone2", "drone3", "drone4", "drone5", "drone6", "drone7", "drone8", "drone9"] },
    wind: { pool: ["wind-howl", "wind-blow2", "cinematic-wind"] },
    thunder: { pool: ["thunder1", "thunder2", "thunder-rumble", "thunder-cinematic", "thunder-bass"] },
    raven: { pool: ["crow-caw", "bird-raven-caw"] },
    metal_rattle: { pool: ["metal-rattle"] },
    horror_stinger: { pool: ["horror1", "horror2", "horror3", "horror4", "horror5", "horror6", "horror7", "horror8", "horror9", "horror10", "horror11", "horror12", "horror13", "horror14", "horror15"] },
    heartbeat: { pool: ["heartbeat"] },

    // ---- Buttons / UI ----
    hover: { pool: ["hover1", "hover2"] },
    click: { pool: ["metallic-click1", "metallic-click2", "click-sharp", "click-small"] },
    click_tech: { pool: ["sci-fi-effect", "technology", "technology2"] },
    electric_tiny: { pool: ["electric-crackle1", "electric-crackle2"] },

    // ---- Reels ----
    reel_start: { pool: ["electric-whoosh", "whoosh2", "whoosh3", "whip", "whip2", "swish", "swish2", "metal-hit", "metal-sword", "metal-rattle"] },
    reel_loop: { pool: ["spin-loop", "slotspin1", "slotspin2", "slotspin3", "slotspin4", "slotspin5", "slotspin6"] },
    reel_stop: { pool: ["slotclack1", "slotclack2", "stomp2", "impact1"] },
    reel_stop_final: { pool: ["stomp1", "impact2", "impact-loud"] },

    // ---- Rare symbol landings — only the red tier and the jester wild
    // get a sound; silver/blue (the common majority of the board) land
    // silently so the board isn't chattering on every settle. ----
    jester_land: { pool: ["magic1", "magic7"] },
    red_moto_land: { pool: ["motorcycle2"] },
    red_lady_land: { pool: ["magic3", "high-tech-bleep"] },
    red_cash_land: { pool: ["coin4", "coin9", "coin15"] },
    red_watch_land: { pool: ["tick2", "bell3"] },
    red_letter_land: { pool: ["swish2", "click-sharp"] },

    // ---- Win tiers ----
    small_win: { pool: ["high-tech-bleep", "electric-zap", "bell3", "metallic-click2", "tones2"], composite: true },
    medium_win: { pool: ["movie-boom", "thunder-cinematic", "motorcycle2", "bell-ding", "bell2", "crowd-cheer2"], composite: true },
    big_win: { pool: ["cinematic-boom", "brass-cinematic", "fire1", "crowd1", "coin4", "coin7"], composite: true },
    huge_win: { pool: ["war-boom2", "fire-roar", "motorcycle-rev", "glass2", "coin9", "coin13", "coin17"], composite: true },

    // ---- Cascades / explosions ----
    cascade_slam: { pool: ["stomp3", "impact2"] },
    explosion_small: { pool: ["impact-loud", "battle-boom"] },
    explosion_medium: { pool: ["movie-boom", "boom-battle2"] },
    explosion_large: { pool: ["cinematic-boom", "war-boom2", "boom-cinematic2"] },

    // ---- Electricity ----
    electric_small: { pool: ["electric-crackle1", "electric-crackle2", "electric-zap"] },
    electric_large: { pool: ["electric-charge", "electric-whoosh"] },
    electric_arc: { pool: ["electric-zap", "magic1", "magic5"] },

    // ---- Fire ----
    fire_burst: { pool: ["fire1", "fire3", "fire6", "fire9", "fire11", "fire13", "fire15"] },
    fire_loop: { pool: ["fire4", "fire-roar"] },

    // ---- Coins ----
    coin_drop: { pool: ["coin1", "coin2", "coin3", "coin4", "coin5", "coin6"] },
    coin_shower: { pool: ["coin7", "coin8", "coin9", "coin10", "coin11", "coin12", "coin13", "coin14"] },
    coin_explosion: { pool: ["coin15", "coin16", "coin17", "coin18", "coin19", "coin20", "coin21"] },

    // ---- Glass ----
    glass_break: { pool: ["glass1", "glass3", "glass5"] },

    // ---- Multipliers ----
    multiplier_x2: { pool: ["electric-zap"] },
    multiplier_x3: { pool: ["electric-crackle1", "tick2"] },
    multiplier_x5: { pool: ["thunder-cinematic"] },
    multiplier_x10: { pool: ["cinematic-boom"] },

    // ---- Count-ups ----
    credit_count: { pool: ["tick3"] },
    win_count: { pool: ["tick4"] },

    // ---- Bonus / jackpot ----
    bonus_trigger: { pool: ["heartbeat", "cartoon-laugh", "thunder-cinematic", "brass-cinematic", "voices1", "suspense2"], composite: true },
    bonus_enter: { pool: ["unlock-magic", "magic3", "magic7", "war-boom2"], composite: true },
    jackpot_intro: { pool: ["heartbeat", "cartoon-laugh"], composite: true },
    jackpot_loop: { pool: ["thunder-rumble"] },
    jackpot_finish: { pool: ["war-boom2", "bell-ding", "bell2", "bell3", "church-bell1", "brass-cinematic", "voices1", "fire-roar", "motorcycle-rev", "motorcycle2", "thunder-bass"], composite: true },

    // ---- Voices / laughs ----
    evil_laugh: { pool: ["cartoon-laugh", "laughevil1", "laughevil4", "laughevil11", "laughevil19", "laughevil24"] },

    // ---- Music (true placeholders w/ generative fallback, see music beds) ----
    main_theme: { pool: [] },
    free_spins_music: { pool: [] },

    // ---- Jester voice lines (true placeholders — record via TTS) ----
    jester_01: { pool: [] }, jester_02: { pool: [] }, jester_03: { pool: [] },
    jester_04: { pool: [] }, jester_05: { pool: [] }, jester_06: { pool: [] },
    jester_07: { pool: [] }, jester_08: { pool: [] }, jester_09: { pool: [] },
    jester_10: { pool: [] },
  };

  const JESTER_KEYS = ["jester_01", "jester_02", "jester_03", "jester_04", "jester_05", "jester_06", "jester_07", "jester_08", "jester_09", "jester_10"];

  // ---- Core engine ------------------------------------------------------

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      sfxBus = ctx.createGain(); sfxBus.gain.value = effectsVolume; sfxBus.connect(masterGain);
      ambBus = ctx.createGain(); ambBus.gain.value = effectsVolume * 0.8; ambBus.connect(masterGain);
      musicBus = ctx.createGain(); musicBus.gain.value = musicVolume; musicBus.connect(masterGain);
      voiceBus = ctx.createGain(); voiceBus.gain.value = effectsVolume; voiceBus.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    unlocked = true;
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
  // small concurrency-limited batches during browser idle time — not one
  // blocking multi-megabyte burst, which would stall low-end/mobile
  // connections. Once cached a file is never re-fetched.
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
    src.connect(g).connect(opts.bus || sfxBus);
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

  // Plays one manifest key: the custom override file if present, else a
  // random (no-immediate-repeat) pick from its pool, else nothing.
  function play(manifestKey, opts) {
    opts = opts || {};
    ensureCtx();
    const entry = MANIFEST[manifestKey];
    if (!entry) return Promise.resolve(null);

    return loadBuffer(CUSTOM_DIR, manifestKey).then((overrideBuffer) => {
      if (overrideBuffer) return playBuffer(overrideBuffer, opts);
      const file = pickFromPool(manifestKey, entry.pool || []);
      if (!file) return null;
      return loadBuffer(SFX_DIR, file).then((buffer) => (buffer ? playBuffer(buffer, opts) : null));
    });
  }

  // Plays several manifest keys layered together with relative timing —
  // used for every composite event (spin press, win tiers, jackpot, etc).
  function layer(list) {
    (list || []).forEach((spec) => play(spec.key, spec));
  }

  function playVoice(name, opts) {
    opts = opts || {};
    ensureCtx();
    return loadBuffer(VOICE_DIR, name).then((buffer) => (buffer ? playBuffer(buffer, Object.assign({ bus: voiceBus, gain: 0.85 }, opts)) : null));
  }

  // Random jester line — never the literal same file twice in a row.
  let lastJester = null;
  function jesterLine(opts) {
    let key;
    do {
      key = JESTER_KEYS[Math.floor(Math.random() * JESTER_KEYS.length)];
    } while (key === lastJester && JESTER_KEYS.length > 1);
    lastJester = key;
    return play(key, Object.assign({ bus: voiceBus, gain: 0.85 }, opts));
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
    game: {
      loops: [
        { key: "wind", gain: 0.12 },
        { key: "drone", gain: 0.15 },
      ],
      periodic: [
        () => schedulePeriodic(() => play("electric_small", { gain: 0.15, bus: ambBus }), 15000, 28000),
        () => schedulePeriodic(() => play("thunder", { gain: 0.2, bus: ambBus }), 40000, 70000),
      ],
    },
    bonus: {
      loops: [
        { key: "thunder", gain: 0.22 },
      ],
      periodic: [
        () => schedulePeriodic(() => play("evil_laugh", { gain: 0.2, bus: ambBus, stopAt: 2.5 }), 15000, 26000),
        () => schedulePeriodic(() => play("electric_large", { gain: 0.22, bus: ambBus }), 8000, 14000),
      ],
      music: "free_spins_music",
    },
  };

  let currentSceneName = null;
  let activeLoopTokens = [];
  let activeTimerCancels = [];

  // ---- Music (crossfading, with generative fallback beds) -----------

  let musicPulseCancel = null;
  let musicAccentCancel = null;
  let currentMusicKey = null;
  const realMusicEls = {};

  // Real tracks layered ON TOP of a scene's ambience (not swapped in via
  // the override system above) — e.g. a real song playing alongside the
  // drone/wind/thunder bed rather than replacing it. Keyed by filename
  // (under live/audio/music/), each with its own gain node on musicBus
  // so it still ducks correctly during jackpot/bonus moments.
  const customTracks = {};

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

  const PULSE_CONFIG = {
    main_theme: { pulseName: "thud", pulseMs: 600, pulseGain: 0.18, accentName: "battle-boom", accentAltName: "boom-battle2", accentMs: 4800, accentGain: 0.22 },
    free_spins_music: { pulseName: "thud", pulseMs: 430, pulseGain: 0.26, accentName: "boom-battle3", accentAltName: "war-boom", accentMs: 3200, accentGain: 0.3 },
  };

  function stopMusicPulse() {
    if (musicPulseCancel) { musicPulseCancel(); musicPulseCancel = null; }
    if (musicAccentCancel) { musicAccentCancel(); musicAccentCancel = null; }
  }

  function startMusicPulse(musicKey) {
    stopMusicPulse();
    const cfg = PULSE_CONFIG[musicKey];
    if (!cfg) return;
    let cancelled = false;
    function pulseTick() {
      if (cancelled) return;
      playBufferByName(cfg.pulseName, cfg.pulseGain * (0.85 + Math.random() * 0.3));
      setTimeout(pulseTick, cfg.pulseMs);
    }
    pulseTick();
    musicPulseCancel = () => { cancelled = true; };
    musicAccentCancel = schedulePeriodic(() => {
      const name = cfg.accentAltName && Math.random() < 0.5 ? cfg.accentAltName : cfg.accentName;
      playBufferByName(name, cfg.accentGain, 1.8);
    }, cfg.accentMs * 0.8, cfg.accentMs * 1.2);
  }

  function playBufferByName(name, gain, stopAt) {
    ensureCtx();
    loadBuffer(SFX_DIR, name).then((buffer) => { if (buffer) playBuffer(buffer, { gain, bus: musicBus, stopAt }); });
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

  function tryMusicOverride(musicKey) {
    const el = new Audio(MUSIC_DIR + musicKey + ".mp3");
    el.loop = true;
    el.addEventListener("canplaythrough", () => {
      if (currentMusicKey !== musicKey || realMusicEls[musicKey]) return;
      stopMusicPulse();
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

  // Crossfades from whatever music is playing to `musicKey` (main_theme /
  // free_spins_music). Uses a real file at audio/music/<key>.mp3 if
  // present, otherwise a generative rhythmic pulse bed built from real
  // sample layers.
  function playMusic(musicKey, opts) {
    opts = opts || {};
    const fadeMs = opts.fadeMs != null ? opts.fadeMs : 1200;
    if (currentMusicKey === musicKey) return;
    ensureCtx();
    fadeMusicOut(fadeMs * 0.5);
    setTimeout(() => {
      stopMusicPulse();
      const prev = currentMusicKey;
      if (prev && realMusicEls[prev]) { try { realMusicEls[prev].pause(); } catch (e) {} delete realMusicEls[prev]; }
      currentMusicKey = musicKey;
      fadeMusicIn(fadeMs * 0.5);
      startMusicPulse(musicKey);
      tryMusicOverride(musicKey);
    }, fadeMs * 0.5);
  }

  function stopMusic(fadeMs) {
    fadeMusicOut(fadeMs != null ? fadeMs : 1200);
    setTimeout(() => {
      stopMusicPulse();
      if (currentMusicKey && realMusicEls[currentMusicKey]) { try { realMusicEls[currentMusicKey].pause(); } catch (e) {} delete realMusicEls[currentMusicKey]; }
      currentMusicKey = null;
    }, fadeMs != null ? fadeMs : 1200);
  }

  function duckMusic(toGain, downTime, holdMs, upTime) {
    if (!musicBus) return;
    const now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setValueAtTime(musicBus.gain.value, now);
    musicBus.gain.linearRampToValueAtTime(toGain, now + downTime);
    setTimeout(() => {
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(musicVolume, t + upTime);
    }, holdMs);
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
  }

  function exitScene() {
    if (!currentSceneName) return;
    activeLoopTokens.forEach((t) => stopLoop(t, 1.0));
    activeLoopTokens = [];
    activeTimerCancels.forEach((c) => c());
    activeTimerCancels = [];
    currentSceneName = null;
  }

  // ---- High-level game events ---------------------------------------

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function hoverSound() { play("hover", { gain: 0.35 }); }

  function clickSound() { play("click", { gain: 0.6 }); }

  // One clean sound per moment — the button press and the reel engaging
  // are two distinct beats, but each is a single sound, not a stack.
  function spinButtonPress() {
    play("click", { gain: 0.8 });
  }

  function reelStart() {
    play("reel_start", { gain: 0.6 });
    play("reel_loop", { gain: 0.3, delay: 0.4, stopAt: 3.0 });
  }

  function reelStop(isLast) {
    if (isLast) {
      layer([
        { key: "reel_stop_final", gain: 0.75 },
        { key: "reel_stop_final", gain: 0.4, delay: 0.02 },
      ]);
    } else {
      layer([
        { key: "reel_stop", gain: 0.55 },
      ]);
    }
  }

  const LANDING_RULES = [
    [/^jester$/, "jester_land"],
    [/^red-moto/, "red_moto_land"],
    [/^red-lady/, "red_lady_land"],
    [/^red-cash/, "red_cash_land"],
    [/^red-watch/, "red_watch_land"],
    [/^red-letter/, "red_letter_land"],
  ];

  // Only the rare (red tier + jester wild) symbols get a landing sound —
  // one distinct sound per rare symbol type. Silver/blue symbols, which
  // make up most of the board every spin, land silently.
  function symbolsLanded(symbolIds) {
    const seen = new Set();
    (symbolIds || []).forEach((id) => {
      const rule = LANDING_RULES.find(([re]) => re.test(id));
      if (!rule) return;
      const key = rule[1];
      if (seen.has(key)) return;
      seen.add(key);
      play(key, { gain: 0.45, stopAt: 0.7 });
    });
  }

  // One sound per win, picked from a small pool per tier (so back-to-back
  // wins of the same size don't sound identical) instead of a pile of
  // layered effects. comboIndex is how many cascades have already
  // chained this spin — each successive hit builds a little louder and
  // brighter so a long combo streak actually feels like it's escalating.
  function winHit(clusterSize, comboIndex) {
    const size = clusterSize || 0;
    const build = Math.min((comboIndex || 0) * 0.06, 0.35);
    let tierKey;
    if (size >= 25) tierKey = "huge_win";
    else if (size >= 15) tierKey = "big_win";
    else if (size >= 10) tierKey = "medium_win";
    else tierKey = "small_win";

    play(tierKey, { gain: 0.55 + build * 0.5, rate: 1 + build * 0.25 });
    if ((comboIndex || 0) >= 2) {
      play("electric_small", { gain: 0.2 + build, rate: 1 + build * 0.5, delay: 0.05 });
    }
  }

  function cascadeSlam() {
    layer([
      { key: "cascade_slam", gain: 0.5 },
    ]);
  }

  function multiplierHit(level) {
    const lvl = level || 1;
    if (lvl >= 10) {
      play("multiplier_x10", { gain: 0.75 });
      play("evil_laugh", { gain: 0.4, delay: 0.15 });
    } else if (lvl >= 5) {
      play("multiplier_x5", { gain: 0.55 });
    } else if (lvl >= 3) {
      play("multiplier_x3", { gain: 0.45 });
    } else {
      play("multiplier_x2", { gain: 0.45 });
    }
  }

  function bonusTrigger() {
    layer([
      { key: "bonus_trigger", gain: 0.5 },
      { key: "heartbeat", gain: 0.5, rate: 0.85, delay: 0.55 },
      { key: "evil_laugh", gain: 0.55, delay: 1.05 },
      { key: "bonus_trigger", gain: 0.4, delay: 1.15 },
      { key: "explosion_large", gain: 0.8, delay: 1.9, stopAt: 2.4 },
    ]);
    setTimeout(() => play("bonus_enter", { gain: 0.6 }), 2100);
  }

  // Guarded against overlapping triggers — without this, two jackpot
  // rolls landing close together (e.g. testing with jackpotChance turned
  // up) would stack their full ~8s sequences on top of each other,
  // which is what "nonstop jackpot ding" actually was.
  let jackpotActive = false;

  function jackpot() {
    if (jackpotActive) return;
    jackpotActive = true;
    ensureCtx();
    duckMusic(0.03, 0.3, 3600, 2.2);
    layer([
      { key: "jackpot_intro", gain: 0.55, rate: 0.8 },
      { key: "jackpot_intro", gain: 0.55, rate: 0.8, delay: 0.7 },
      { key: "evil_laugh", gain: 0.55, rate: 0.95, delay: 1.6 },
    ]);
    const loopToken = startLoop("jackpot_loop", { gain: 0.22, bus: sfxBus, fadeIn: 0.3 });
    setTimeout(() => {
      stopLoop(loopToken, 0.2);
      layer([
        { key: "jackpot_finish", gain: 0.95 },
        { key: "jackpot_finish", gain: 0.45, delay: 0.2 },
        { key: "coin_explosion", gain: 0.45, delay: 0.35 },
      ]);
    }, 2600);
    setTimeout(() => voiceLine("fortune_favors_the_fearless"), 5200);
    setTimeout(() => voiceLine("whisper_again", { gain: 0.5 }), 6800);
    setTimeout(() => { jackpotActive = false; }, 8000);
  }

  function signInPress() {
    layer([
      { key: "electric_large", gain: 0.6 },
      { key: "electric_arc", gain: 0.35, delay: 0.05, stopAt: 1.2 },
      { key: "explosion_small", gain: 0.55, delay: 0.08, stopAt: 1.4 },
    ]);
  }

  function enterBonusMusic() { playMusic("free_spins_music"); }
  function exitBonusMusic() { playMusic("main_theme"); }

  function animateCountUp(el, from, to, durationMs, tickKey) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    if (Math.abs(diff) < 0.001) { el.textContent = to.toFixed(1); return; }
    let lastTickAt = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      const val = from + diff * eased;
      el.textContent = val.toFixed(1);
      if (now - lastTickAt > 60) {
        lastTickAt = now;
        play(tickKey || "win_count", { gain: 0.2 });
      }
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = to.toFixed(1);
    }
    requestAnimationFrame(frame);
  }

  const ANTICIPATION_LINES = ["jester_01", "jester_02", "jester_03", "jester_04", "jester_05", "jester_06"];

  function voiceLine(key, opts) { playVoice(key, opts); }

  function maybeVoiceLine(chance) {
    if (Math.random() < chance) jesterLine();
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

  function setMusicVolume(v) {
    musicVolume = v;
    if (musicBus) musicBus.gain.value = v;
  }
  function setEffectsVolume(v) {
    effectsVolume = v;
    if (sfxBus) sfxBus.gain.value = v;
    if (voiceBus) voiceBus.gain.value = v;
    if (ambBus) ambBus.gain.value = v * 0.8;
  }

  return {
    start, setMuted, isMuted, setMusicVolume, setEffectsVolume,
    preloadAll, play, layer, enterScene,
    hoverSound, clickSound, spinButtonPress,
    reelStart, reelStop, symbolsLanded,
    winHit, cascadeSlam, multiplierHit,
    bonusTrigger, jackpot, signInPress,
    enterBonusMusic, exitBonusMusic, playMusic, stopMusic,
    startCustomTrack, stopCustomTrack,
    animateCountUp,
    voiceLine, jesterLine, maybeVoiceLine,
  };
})();

// Backward-compatible alias — older call sites can keep using DrAudio.
const DrAudio = AudioManager;
