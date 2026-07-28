/*
  AudioManager for Dangerous Rides.

  Two independent layers, kept strictly apart:
    - Ambience/music (drone/wind loops, the lobby "music" key, custom
      background tracks) — untouched by this file's SFX work. Nothing
      below ever changes gain, timing, looping, or selection for those.
    - Play-screen sound effects — reel spins, symbol landings, wins,
      cascades, multipliers, bonus/jackpot fanfare, and UI clicks. These
      live on their own gain bus (sfxBus) so they can never duck or
      overpower the ambience/music bus.

  Every sound is declared once in MANIFEST as a `pool` of sample basenames
  under live/audio/sfx/<name>.mp3, picked at random with no immediate
  repeat. A key with an empty pool (the ten jester voice lines) is a true
  placeholder — play() on it is a graceful no-op until a real file is
  dropped in under live/audio/voice/.

  Anti-spam rules baked in for the 8x8 grid:
    - symbolsLanded() only ever sounds for the rare/red tier + the jester
      wild — the ~58 common silver/blue tiles every spin land silently.
    - winHit()/cascadeSlam() are hard-capped to the first few cascades of
      any single chain (CASCADE_AUDIO_CAP) — a 100-cascade bonus chain
      does not mean 100 sounds, it means a handful up front and then
      silence while the visuals keep going.
    - No sound effect ever plays per-symbol across the whole 64-tile
      board, and explosions/fanfare are reserved for bonus/jackpot only,
      never fired per regular win.
*/

const AudioManager = (() => {
  const SFX_DIR = "audio/sfx/";
  const VOICE_DIR = "audio/voice/";
  const MUSIC_DIR = "audio/music/";

  let ctx = null;
  let masterGain, ambBus, sfxBus, musicBus;
  let muted = false;
  let musicVolume = 0.55;
  let effectsVolume = 0.85;

  const bufferCache = {}; // "dir+name" -> Promise<AudioBuffer|null>
  const lastPlayed = {};  // manifest key -> last file name picked (no-repeat)

  const MANIFEST = {
    // ---- Ambience (login / lobby / game) — untouched by SFX work ----
    drone: { pool: ["drone1", "drone2", "drone3", "drone4", "drone5", "drone6", "drone7", "drone8", "drone9"] },
    wind: { pool: ["wind-howl", "wind-blow2", "cinematic-wind"] },
    thunder: { pool: ["thunder1", "thunder2", "thunder-rumble", "thunder-cinematic", "thunder-bass"] },
    raven: { pool: ["crow-caw", "bird-raven-caw"] },
    metal_rattle: { pool: ["metal-rattle"] },
    heartbeat: { pool: ["heartbeat"] },

    // ---- Sign-in button press ----
    electric_large: { pool: ["electric-charge", "electric-whoosh"] },
    electric_arc: { pool: ["electric-zap", "magic1", "magic5"] },

    // ---- Buttons / UI (play screen) ----
    hover: { pool: ["hover1", "hover2"] },
    click: { pool: ["metallic-click1", "metallic-click2", "click-sharp", "click-small"] },
    click_tech: { pool: ["sci-fi-effect", "technology", "technology2"] },
    electric_tiny: { pool: ["electric-crackle1", "electric-crackle2"] },

    // ---- Reels ----
    reel_start: { pool: ["electric-whoosh", "whoosh2", "whoosh3", "whip", "whip2", "swish", "swish2", "metal-hit", "metal-sword", "metal-rattle"] },
    reel_loop: { pool: ["spin-loop", "slotspin1", "slotspin2", "slotspin3", "slotspin4", "slotspin5", "slotspin6"] },
    // slotclack1/slotclack2 used to be in this pool — despite the name,
    // they're actually 6-11s continuous buzzing/rattling drones, not
    // short clacks, so every reel landing had a chance to trigger a
    // long obnoxious buzz right at the end of a spin. Pulled.
    reel_stop: { pool: ["stomp2", "impact1"] },
    reel_stop_final: { pool: ["stomp1", "impact2", "impact-loud"] },

    // ---- Rare symbol landings — only the red tier + jester wild get a
    // sound; silver/blue (the vast majority of an 8x8 board) land
    // silently, and duplicates of the same rare type in one spin only
    // sound once (see symbolsLanded). ----
    jester_land: { pool: ["magic1", "magic7"] },
    red_moto_land: { pool: ["motorcycle2"] },
    red_lady_land: { pool: ["magic3", "high-tech-bleep"] },
    red_cash_land: { pool: ["coin4", "coin9", "coin15"] },
    red_watch_land: { pool: ["tick2", "bell3"] },
    red_letter_land: { pool: ["swish2", "click-sharp"] },

    // ---- Win tiers — one sound per win, not a pile of layered effects ----
    small_win: { pool: ["high-tech-bleep", "electric-zap", "bell3", "metallic-click2", "tones2"] },
    medium_win: { pool: ["movie-boom", "thunder-cinematic", "motorcycle2", "bell-ding", "bell2", "crowd-cheer2"] },
    big_win: { pool: ["cinematic-boom", "brass-cinematic", "fire1", "crowd1", "coin4", "coin7"] },
    huge_win: { pool: ["war-boom2", "fire-roar", "motorcycle-rev", "glass2", "coin9", "coin13", "coin17"] },

    // ---- Cascades ----
    cascade_slam: { pool: ["stomp3", "impact2"] },
    electric_small: { pool: ["electric-crackle1", "electric-crackle2", "electric-zap"] },

    // ---- Explosions — reserved for bonus/jackpot, never per-win ----
    explosion_medium: { pool: ["movie-boom", "boom-battle2"] },
    explosion_large: { pool: ["cinematic-boom", "war-boom2", "boom-cinematic2"] },

    // ---- Fire (accent layers inside big/huge win + jackpot only) ----
    fire_burst: { pool: ["fire1", "fire3", "fire6", "fire9", "fire11", "fire13", "fire15"] },
    fire_loop: { pool: ["fire4", "fire-roar"] },

    // ---- Coins ----
    coin_drop: { pool: ["coin1", "coin2", "coin3", "coin4", "coin5", "coin6"] },
    coin_shower: { pool: ["coin7", "coin8", "coin9", "coin10", "coin11", "coin12", "coin13", "coin14"] },
    coin_explosion: { pool: ["coin15", "coin16", "coin17", "coin18", "coin19", "coin20", "coin21"] },

    // ---- Glass (bonus/jackpot accent only) ----
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
    bonus_trigger: { pool: ["heartbeat", "cartoon-laugh", "thunder-cinematic", "brass-cinematic", "voices1", "suspense2"] },
    bonus_enter: { pool: ["unlock-magic", "magic3", "magic7", "war-boom2"] },
    jackpot_intro: { pool: ["heartbeat", "cartoon-laugh"] },
    jackpot_loop: { pool: ["thunder-rumble"] },
    jackpot_finish: { pool: ["war-boom2", "bell-ding", "bell2", "bell3", "church-bell1", "brass-cinematic", "voices1", "fire-roar", "motorcycle-rev", "motorcycle2", "thunder-bass"] },

    // ---- Evil laugh (multiplier x10 + jackpot accent only) ----
    evil_laugh: { pool: ["cartoon-laugh", "laughevil1", "laughevil4", "laughevil11", "laughevil19", "laughevil24"] },
  };

  // Jester voice lines — true placeholders. No TTS files exist yet; drop
  // live/audio/voice/jester_01.mp3 .. jester_10.mp3 (deep/sinister voice,
  // -3 semitones, ~40% reverb per the brief) and these start working with
  // no code changes. Until then every call below is a silent no-op.
  const JESTER_KEYS = ["jester_01", "jester_02", "jester_03", "jester_04", "jester_05", "jester_06", "jester_07", "jester_08", "jester_09", "jester_10"];

  // ---- Core engine ------------------------------------------------------

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      ambBus = ctx.createGain(); ambBus.gain.value = 0.9 * 0.8; ambBus.connect(masterGain);
      sfxBus = ctx.createGain(); sfxBus.gain.value = effectsVolume; sfxBus.connect(masterGain);
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

  // TEMPORARY debug readout — shows the last few sounds played so we can
  // pin down exactly which manifest key + file is the buzzer by reading
  // it off the screen. Remove once that's confirmed.
  let debugLog = [];
  function debugShow(manifestKey, file) {
    debugLog.unshift(new Date().toISOString().slice(11, 19) + "  " + manifestKey + " -> " + file);
    debugLog = debugLog.slice(0, 6);
    let el = document.getElementById("__sfxDebug");
    if (!el) {
      el = document.createElement("div");
      el.id = "__sfxDebug";
      el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(0,0,0,0.85);color:#0f0;font:11px/1.4 monospace;padding:6px 8px;pointer-events:none;white-space:pre;";
      document.body.appendChild(el);
    }
    el.textContent = debugLog.join("\n");
  }

  // Plays one manifest key: a random (no-immediate-repeat) pick from its
  // pool, or nothing if the pool is empty (true placeholder).
  function play(manifestKey, opts) {
    opts = opts || {};
    ensureCtx();
    const entry = MANIFEST[manifestKey];
    if (!entry) return Promise.resolve(null);
    const file = pickFromPool(manifestKey, entry.pool || []);
    if (!file) return Promise.resolve(null);
    debugShow(manifestKey, file);
    return loadBuffer(SFX_DIR, file).then((buffer) => (buffer ? playBuffer(buffer, opts) : null));
  }

  // Plays several manifest keys layered together with relative timing —
  // used for the handful of genuinely composite moments (spin press,
  // bonus trigger, jackpot).
  function layer(list) {
    (list || []).forEach((spec) => play(spec.key, spec));
  }

  // A specific voice file under live/audio/voice/<name>.mp3 — separate
  // from the pool system since each jester line is a distinct clip, not
  // a random pick. Graceful no-op until the file exists.
  function playVoice(name, opts) {
    opts = opts || {};
    ensureCtx();
    return loadBuffer(VOICE_DIR, name).then((buffer) => (buffer ? playBuffer(buffer, Object.assign({ bus: sfxBus, gain: 0.85 }, opts)) : null));
  }

  let lastJester = null;
  function jesterLine(opts) {
    let key;
    do {
      key = JESTER_KEYS[Math.floor(Math.random() * JESTER_KEYS.length)];
    } while (key === lastJester && JESTER_KEYS.length > 1);
    lastJester = key;
    return playVoice(key, opts);
  }

  function maybeVoiceLine(chance) {
    if (Math.random() < chance) jesterLine();
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

  // ---- Ambience scenes — EXACTLY as already selected. Nothing in the
  // SFX section below ever touches loops, gains, or scene definitions
  // here. ----------------------------------------------------------

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
        () => schedulePeriodic(() => play("heartbeat", { gain: 0.35, rate: 0.9, bus: ambBus }), 45000, 90000),
      ],
      // No generative pulse bed — matches the sign-in screen for now.
      // Drop a real track at live/audio/music/lobby_theme.mp3 and it
      // takes over automatically, no code changes needed.
      music: "lobby_theme",
    },
    // The game screen's ambience is exactly this one loop — untouched.
    // All play-screen SFX below layer on top of it via sfxBus, never
    // by editing this scene.
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

  // ---- Sign-in button press ----

  function signInPress() {
    layer([
      { key: "electric_large", gain: 0.6 },
      { key: "electric_arc", gain: 0.35, delay: 0.05, stopAt: 1.2 },
    ]);
  }

  // ---- Play-screen sound effects --------------------------------------
  // Everything below is additive on sfxBus. None of it touches ambBus,
  // musicBus, or the SCENES table above.

  function hoverSound() { play("hover", { gain: 0.3 }); }

  function clickSound() { play("click", { gain: 0.55 }); }

  // "Metal click + tech click" — used to also layer in an electric_tiny
  // crackle here, but that's a buzzy, alarm-like sample and it was firing
  // on literally every single spin press. Dropped; click + click_tech
  // alone still give the button a solid press feel.
  function spinButtonPress() {
    layer([
      { key: "click", gain: 0.7 },
      { key: "click_tech", gain: 0.45, delay: 0.03 },
    ]);
  }

  function reelStart() {
    play("reel_start", { gain: 0.55 });
    play("reel_loop", { gain: 0.28, delay: 0.4, stopAt: 3.0 });
  }

  // One sound per reel as it lands — mechanical and expected (8 columns,
  // not 64 tiles), the last column lands a touch heavier.
  function reelStop(isLast) {
    if (isLast) play("reel_stop_final", { gain: 0.75 });
    else play("reel_stop", { gain: 0.5 });
  }

  const LANDING_RULES = [
    [/^jester$/, "jester_land"],
    [/^red-moto/, "red_moto_land"],
    [/^red-lady/, "red_lady_land"],
    [/^red-cash/, "red_cash_land"],
    [/^red-watch/, "red_watch_land"],
    [/^red-letter/, "red_letter_land"],
  ];

  // Only the rare (red tier + jester wild) symbols get a landing sound,
  // one per distinct type max — an 8x8 board (64 tiles) never produces
  // more than 6 sounds here, and typically 0-2. Silver/blue, the common
  // majority of the board, land silently every time.
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

  // Cascades can chain deep in bonus rounds (theoretically up to ~100 to
  // guarantee a jackpot) — audio is hard-capped to the first few beats of
  // any one chain so a long combo streak is heard, not endured. Beyond
  // the cap the cascade still resolves visually, just silently.
  const CASCADE_AUDIO_CAP = 5;

  // One sound per win, picked from a small pool per tier (so back-to-back
  // wins of the same size don't sound identical) instead of a pile of
  // layered effects. comboIndex is how many cascades have already
  // chained this spin — each successive hit builds a little louder and
  // brighter so a streak feels like it's escalating, up to the cap.
  function winHit(clusterSize, comboIndex) {
    const idx = comboIndex || 0;
    if (idx >= CASCADE_AUDIO_CAP) return;
    const size = clusterSize || 0;
    const build = Math.min(idx * 0.06, 0.3);
    let tierKey;
    if (size >= 25) tierKey = "huge_win";
    else if (size >= 15) tierKey = "big_win";
    else if (size >= 10) tierKey = "medium_win";
    else tierKey = "small_win";

    play(tierKey, { gain: 0.55 + build * 0.5, rate: 1 + build * 0.25 });
    play("coin_drop", { gain: 0.3, delay: 0.07 });
    if (idx >= 2) play("electric_small", { gain: 0.18 + build, rate: 1 + build * 0.5, delay: 0.05 });
    if (tierKey === "huge_win") maybeVoiceLine(0.25);
  }

  function cascadeSlam(comboIndex) {
    if ((comboIndex || 0) >= CASCADE_AUDIO_CAP) return;
    play("cascade_slam", { gain: 0.45 });
  }

  function multiplierHit(level) {
    const lvl = level || 1;
    if (lvl >= 10) {
      play("multiplier_x10", { gain: 0.7 });
      play("evil_laugh", { gain: 0.35, delay: 0.15 });
    } else if (lvl >= 5) {
      play("multiplier_x5", { gain: 0.5 });
    } else if (lvl >= 3) {
      play("multiplier_x3", { gain: 0.4 });
    } else {
      play("multiplier_x2", { gain: 0.4 });
    }
  }

  // Hard cooldowns on the two "big noise" moments — not just guarded
  // against overlapping calls, but rate-limited outright. However often
  // the game logic decides to award a bonus/jackpot, the fanfare itself
  // can never fire more than once per cooldown window.
  let lastBonusTriggerAt = 0;
  const BONUS_AUDIO_COOLDOWN_MS = 20000;

  function bonusTrigger() {
    const now = Date.now();
    if (now - lastBonusTriggerAt < BONUS_AUDIO_COOLDOWN_MS) return;
    lastBonusTriggerAt = now;
    layer([
      { key: "bonus_trigger", gain: 0.5 },
      { key: "explosion_large", gain: 0.7, delay: 0.9, stopAt: 2.2 },
    ]);
    setTimeout(() => play("bonus_enter", { gain: 0.55 }), 1100);
    maybeVoiceLine(0.3);
  }

  let jackpotActive = false;
  let lastJackpotAt = 0;
  const JACKPOT_AUDIO_COOLDOWN_MS = 60000;

  function jackpot() {
    const now = Date.now();
    if (jackpotActive || now - lastJackpotAt < JACKPOT_AUDIO_COOLDOWN_MS) return;
    jackpotActive = true;
    lastJackpotAt = now;
    ensureCtx();
    play("jackpot_intro", { gain: 0.55, rate: 0.9 });
    const loopToken = startLoop("jackpot_loop", { gain: 0.2, bus: sfxBus, fadeIn: 0.3 });
    setTimeout(() => {
      stopLoop(loopToken, 0.2);
      play("jackpot_finish", { gain: 0.85 });
      play("coin_explosion", { gain: 0.4, delay: 0.2 });
      jesterLine();
    }, 1800);
    setTimeout(() => { jackpotActive = false; }, 8000);
  }

  // Silent visual count-up, with a quiet tick under it — capped to the
  // ~700ms of the animation, never a standalone repeating sound.
  function animateCountUp(el, from, to, durationMs, tickKey) {
    if (!el) return;
    const start = performance.now();
    const diff = to - from;
    if (Math.abs(diff) < 0.001) { el.textContent = to.toFixed(1); return; }
    let lastTickAt = 0;
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 2);
      el.textContent = (from + diff * eased).toFixed(1);
      if (now - lastTickAt > 70) {
        lastTickAt = now;
        play(tickKey || "win_count", { gain: 0.15 });
      }
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

  function setEffectsVolume(v) {
    effectsVolume = v;
    if (sfxBus) sfxBus.gain.value = v;
  }

  return {
    start, setMuted, isMuted, setEffectsVolume,
    preloadAll, enterScene,
    signInPress,
    startCustomTrack, stopCustomTrack,
    animateCountUp,
    hoverSound, clickSound, spinButtonPress,
    reelStart, reelStop, symbolsLanded,
    winHit, cascadeSlam, multiplierHit,
    bonusTrigger, jackpot,
    jesterLine, maybeVoiceLine,
  };
})();

// Backward-compatible alias — older call sites can keep using DrAudio.
const DrAudio = AudioManager;
