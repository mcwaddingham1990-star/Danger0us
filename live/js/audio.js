/*
  Sample-based sound engine for Dangerous Rides.

  Every sound here is a real recorded sample (see live/audio/sfx/), layered
  and sequenced through the Web Audio API — nothing is synthesized from
  oscillators. Loops (ambience beds) and one-shots (impacts, stingers) all
  route through a small set of gain buses so mute/volume is centralized.

  If a real composed music track is ever dropped at live/audio/music/
  lobby.mp3 or bonus.mp3, it automatically takes over from the generative
  rhythmic pulse for that scene.
*/

const DrAudio = (() => {
  const SFX_DIR = "audio/sfx/";
  const MUSIC_DIR = "audio/music/";
  const VOICE_DIR = "audio/voice/";

  let ctx = null;
  let masterGain, sfxBus, ambBus, musicBus, voiceBus;
  let muted = false;

  const bufferCache = {}; // name -> Promise<AudioBuffer|null>

  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(masterGain);
      ambBus = ctx.createGain(); ambBus.gain.value = 0.7; ambBus.connect(masterGain);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(masterGain);
      voiceBus = ctx.createGain(); voiceBus.gain.value = 0.85; voiceBus.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function loadBuffer(dir, name) {
    const key = dir + name;
    if (bufferCache[key]) return bufferCache[key];
    bufferCache[key] = fetch(dir + name + ".mp3")
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    return bufferCache[key];
  }

  // One-shot sample playback. opts: gain, rate, delay(s from now), bus,
  // stopAt(s) — cuts the sample short with a quick fade instead of a click.
  function play(name, opts) {
    opts = opts || {};
    ensureCtx();
    return loadBuffer(SFX_DIR, name).then((buffer) => {
      if (!buffer) return null;
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
    });
  }

  function layer(list) { (list || []).forEach((spec) => play(spec.name, spec)); }

  function playVoice(name, opts) {
    opts = opts || {};
    ensureCtx();
    return loadBuffer(VOICE_DIR, name).then((buffer) => {
      if (!buffer) return null;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const g = ctx.createGain();
      g.gain.value = opts.gain != null ? opts.gain : 0.85;
      src.connect(g).connect(voiceBus);
      src.start(ctx.currentTime + (opts.delay || 0));
      return src;
    });
  }

  // Loops a sample indefinitely on a bus; returns a token for stopLoop().
  function startLoop(name, opts) {
    opts = opts || {};
    ensureCtx();
    const token = { stopped: false };
    loadBuffer(SFX_DIR, name).then((buffer) => {
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

  // Repeats fn() at a random interval in [minMs, maxMs], with a random
  // initial delay so parallel periodic layers don't sync up on a scene.
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

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---- Scenes: looping ambience beds + periodic accent one-shots -------

  const SCENES = {
    login: {
      loops: [
        { name: "drone2", gain: 0.28, bus: () => ambBus },
        { name: "wind-howl", gain: 0.16, bus: () => ambBus },
      ],
      periodic: [
        () => schedulePeriodic(() => play(pick(["thunder-cinematic", "thunder1", "thunder2"]), { gain: 0.5, bus: ambBus }), 20000, 40000),
        () => schedulePeriodic(() => play(pick(["crow-caw", "bird-raven-caw"]), { gain: 0.3, bus: ambBus }), 15000, 32000),
        () => schedulePeriodic(() => play("metal-rattle", { gain: 0.28, bus: ambBus }), 24000, 42000),
        () => schedulePeriodic(() => play(pick(["electric-crackle1", "electric-crackle2"]), { gain: 0.22, bus: ambBus }), 6000, 12000),
        () => schedulePeriodic(() => play("heartbeat", { gain: 0.35, rate: 0.9, bus: ambBus }), 2300, 2700),
      ],
    },
    lobby: {
      loops: [
        { name: "drone3", gain: 0.25, bus: () => ambBus },
        { name: "cinematic-wind", gain: 0.15, bus: () => ambBus },
      ],
      music: { pulseName: "thud", pulseMs: 600, pulseGain: 0.18, accentName: "battle-boom", accentMs: 4800, accentGain: 0.22 },
      periodic: [
        () => schedulePeriodic(() => play("thunder-cinematic", { gain: 0.32, bus: ambBus }), 18000, 34000),
        () => schedulePeriodic(() => play(pick(["swish", "swish2"]), { gain: 0.3, bus: ambBus }), 9000, 16000),
        () => schedulePeriodic(() => play(pick(["motorcycle-rev", "motorcycle2"]), { gain: 0.28, bus: ambBus, stopAt: 2.2 }), 22000, 40000),
        () => schedulePeriodic(() => play("thunder-bass", { gain: 0.3, bus: ambBus, stopAt: 2.0 }), 20000, 38000),
        () => schedulePeriodic(() => play("electric-crackle2", { gain: 0.2, bus: ambBus }), 10000, 18000),
      ],
    },
    game: {
      loops: [
        { name: "wind-blow2", gain: 0.12, bus: () => ambBus },
        { name: "drone7", gain: 0.15, bus: () => ambBus },
      ],
      periodic: [
        () => schedulePeriodic(() => play("electric-crackle1", { gain: 0.15, bus: ambBus }), 15000, 28000),
        () => schedulePeriodic(() => play("thunder-cinematic", { gain: 0.2, bus: ambBus }), 40000, 70000),
      ],
    },
    bonus: {
      loops: [
        { name: "thunder-rumble", gain: 0.22, bus: () => ambBus },
      ],
      music: { pulseName: "thud", pulseMs: 430, pulseGain: 0.26, accentName: "battle-boom", accentAltName: "war-boom", accentMs: 3200, accentGain: 0.3 },
      periodic: [
        () => schedulePeriodic(() => play("brass-cinematic", { gain: 0.3, bus: ambBus, stopAt: 3.5 }), 9000, 15000),
        () => schedulePeriodic(() => play("voices1", { gain: 0.22, bus: ambBus, stopAt: 3.0 }), 12000, 20000),
        () => schedulePeriodic(() => play("mystic-tones", { gain: 0.2, bus: ambBus }), 5000, 9000),
        () => schedulePeriodic(() => play("motorcycle-rev", { gain: 0.22, bus: ambBus, stopAt: 1.8 }), 20000, 30000),
      ],
    },
  };

  let currentSceneName = null;
  let activeLoopTokens = [];
  let activeTimerCancels = [];
  let musicPulseCancel = null;
  let musicAccentCancel = null;
  const realMusicEls = {};

  function stopMusicPulse() {
    if (musicPulseCancel) { musicPulseCancel(); musicPulseCancel = null; }
    if (musicAccentCancel) { musicAccentCancel(); musicAccentCancel = null; }
  }

  function startMusicPulse(cfg) {
    stopMusicPulse();
    let cancelled = false;
    function pulseTick() {
      if (cancelled) return;
      play(cfg.pulseName, { gain: cfg.pulseGain * (0.85 + Math.random() * 0.3), bus: musicBus });
      setTimeout(pulseTick, cfg.pulseMs);
    }
    pulseTick();
    musicPulseCancel = () => { cancelled = true; };

    musicAccentCancel = schedulePeriodic(() => {
      const name = cfg.accentAltName && Math.random() < 0.5 ? cfg.accentAltName : cfg.accentName;
      play(name, { gain: cfg.accentGain, bus: musicBus, stopAt: 1.8 });
    }, cfg.accentMs * 0.8, cfg.accentMs * 1.2);
  }

  function tryMusicOverride(sceneName) {
    const el = new Audio(MUSIC_DIR + sceneName + ".mp3");
    el.loop = true;
    el.addEventListener("canplaythrough", () => {
      if (currentSceneName !== sceneName || realMusicEls[sceneName]) return;
      stopMusicPulse();
      ensureCtx();
      try {
        const src = ctx.createMediaElementSource(el);
        src.connect(musicBus);
      } catch (e) {}
      el.volume = 1;
      el.play().catch(() => {});
      realMusicEls[sceneName] = el;
    }, { once: true });
  }

  function enterScene(name) {
    if (currentSceneName === name) return;
    exitScene();
    const scene = SCENES[name];
    if (!scene) return;
    ensureCtx();
    currentSceneName = name;

    activeLoopTokens = (scene.loops || []).map((l) => startLoop(l.name, { gain: l.gain, bus: ambBus, fadeIn: 2 }));
    activeTimerCancels = (scene.periodic || []).map((fn) => fn());

    if (scene.music) {
      startMusicPulse(scene.music);
      tryMusicOverride(name);
    }
  }

  function exitScene() {
    if (!currentSceneName) return;
    activeLoopTokens.forEach((t) => stopLoop(t, 1.0));
    activeLoopTokens = [];
    activeTimerCancels.forEach((c) => c());
    activeTimerCancels = [];
    stopMusicPulse();
    const prev = currentSceneName;
    if (realMusicEls[prev]) {
      try { realMusicEls[prev].pause(); } catch (e) {}
      delete realMusicEls[prev];
    }
    currentSceneName = null;
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
      musicBus.gain.linearRampToValueAtTime(0.55, t + upTime);
    }, holdMs);
  }

  // ---- Game event cues ---------------------------------------------

  // Spin button press + reels engaging, as one continuous cue: heavy
  // click -> charge -> sub bass, then gears/chain/cards spinning up.
  function spinStart() {
    layer([
      { name: "metallic-click1", gain: 0.9 },
      { name: "electric-crackle2", gain: 0.5, delay: 0.04 },
      { name: "impact-loud", gain: 0.6, delay: 0.1 },
      { name: "metal-hit", gain: 0.5, delay: 0.22 },
      { name: "metal-sword", gain: 0.45, delay: 0.26 },
      { name: "metal-rattle", gain: 0.35, delay: 0.34 },
      { name: "whip", gain: 0.4, delay: 0.42 },
      { name: "whip2", gain: 0.35, delay: 0.5 },
      { name: "electric-charge", gain: 0.4, delay: 0.6 },
      { name: "spin-loop", gain: 0.35, delay: 0.85, stopAt: 3.0 },
    ]);
  }

  // Each reel stopping: light CLACK, except the last column which lands
  // as a heavier CLANK — the climax of the spin.
  function reelStop(isLast) {
    if (isLast) {
      layer([
        { name: "stomp1", gain: 0.75 },
        { name: "impact2", gain: 0.55, delay: 0.02 },
        { name: "impact-loud", gain: 0.4, delay: 0.04 },
      ]);
    } else {
      layer([
        { name: "stomp2", gain: 0.55 },
        { name: "impact1", gain: 0.3, delay: 0.02 },
      ]);
    }
  }

  // Tiered win cue, scaled by cluster size — small/medium/huge. This is
  // the single "everything gets louder" escalation the win moments hinge on.
  function winHit(clusterSize) {
    const size = clusterSize || 0;
    if (size >= 20) {
      layer([
        { name: "cinematic-boom", gain: 0.85 },
        { name: "fire-roar", gain: 0.5, delay: 0.05, stopAt: 2.2 },
        { name: "thunder-cinematic", gain: 0.6, delay: 0.08 },
        { name: "motorcycle-rev", gain: 0.4, delay: 0.1, stopAt: 2.5 },
        { name: "metal-sword", gain: 0.45, delay: 0.15 },
        { name: "car-slam", gain: 0.4, delay: 0.18 },
        { name: "electric-crackle1", gain: 0.4, delay: 0.2 },
        { name: "bell-ding", gain: 0.35, delay: 0.28 },
        { name: "bell2", gain: 0.32, delay: 0.36 },
        { name: "bell3", gain: 0.32, delay: 0.44 },
        { name: "metallic-click1", gain: 0.3, delay: 0.5 },
        { name: "metallic-click2", gain: 0.3, delay: 0.58 },
        { name: "war-boom2", gain: 0.5, delay: 0.32, stopAt: 2.0 },
      ]);
    } else if (size >= 10) {
      layer([
        { name: "movie-boom", gain: 0.6, stopAt: 1.6 },
        { name: "thunder-cinematic", gain: 0.45, delay: 0.05 },
        { name: "motorcycle2", gain: 0.35, delay: 0.1, stopAt: 1.8 },
        { name: "bell-ding", gain: 0.4, delay: 0.02 },
        { name: "bell2", gain: 0.35, delay: 0.12 },
        { name: "metallic-click1", gain: 0.3, delay: 0.18 },
        { name: "metallic-click2", gain: 0.3, delay: 0.24 },
        { name: "crowd-cheer2", gain: 0.16, delay: 0.15, stopAt: 2.5 },
      ]);
    } else {
      layer([
        { name: "high-tech-bleep", gain: 0.5 },
        { name: "electric-zap", gain: 0.5, delay: 0.03 },
        { name: "bell3", gain: 0.4, delay: 0.05 },
        { name: "metallic-click2", gain: 0.35, delay: 0.09 },
        { name: "tones2", gain: 0.3, delay: 0.12 },
      ]);
    }
  }

  // New symbols dropping in after a cascade clears — a heavy SLAM, not a
  // simple fall.
  function cascadeSlam() {
    layer([
      { name: "stomp3", gain: 0.5 },
      { name: "impact2", gain: 0.4, delay: 0.02 },
    ]);
  }

  function multiplierHit(level) {
    const lvl = level || 1;
    if (lvl >= 25) {
      layer([
        { name: "war-boom2", gain: 0.9 },
        { name: "cinematic-boom", gain: 0.7, delay: 0.05 },
        { name: "cartoon-laugh", gain: 0.5, delay: 0.2 },
        { name: "electric-crackle1", gain: 0.4, delay: 0.05 },
      ]);
    } else if (lvl >= 10) {
      layer([
        { name: "cinematic-boom", gain: 0.75 },
        { name: "thunder-cinematic", gain: 0.5, delay: 0.05 },
      ]);
    } else if (lvl >= 5) {
      play("thunder-cinematic", { gain: 0.55 });
    } else {
      play("electric-zap", { gain: 0.45 });
    }
  }

  // Everything pauses: heartbeat... heartbeat... the jester laughs...
  // lightning flashes... deep choir begins... then the screen explodes blue.
  function bonusTrigger() {
    layer([
      { name: "heartbeat", gain: 0.5, rate: 0.85, delay: 0.0 },
      { name: "heartbeat", gain: 0.5, rate: 0.85, delay: 0.55 },
      { name: "cartoon-laugh", gain: 0.55, delay: 1.05 },
      { name: "thunder-cinematic", gain: 0.5, delay: 1.15 },
      { name: "brass-cinematic", gain: 0.4, delay: 1.35, stopAt: 2.2 },
      { name: "voices1", gain: 0.3, delay: 1.4, stopAt: 2.2 },
      { name: "war-boom2", gain: 0.8, delay: 1.9, stopAt: 2.4 },
      { name: "electric-crackle1", gain: 0.4, delay: 1.95 },
    ]);
  }

  // Music stops, silence, heartbeat, the jester's laugh slowly builds,
  // lightning crawls — then the full over-the-top payoff.
  function jackpot() {
    ensureCtx();
    duckMusic(0.03, 0.3, 3600, 2.2);
    layer([
      { name: "heartbeat", gain: 0.55, rate: 0.8, delay: 0.0 },
      { name: "heartbeat", gain: 0.55, rate: 0.8, delay: 0.6 },
      { name: "heartbeat", gain: 0.55, rate: 0.8, delay: 1.2 },
      { name: "cartoon-laugh", gain: 0.5, rate: 0.9, delay: 1.5 },
      { name: "cartoon-laugh", gain: 0.6, rate: 1.05, delay: 2.2 },
      { name: "thunder-cinematic", gain: 0.55, delay: 2.6 },
      { name: "war-boom2", gain: 0.95, delay: 2.75 },
      { name: "bell-ding", gain: 0.5, delay: 2.8 },
      { name: "bell2", gain: 0.5, delay: 2.95 },
      { name: "bell3", gain: 0.5, delay: 3.1 },
      { name: "brass-cinematic", gain: 0.5, delay: 2.85, stopAt: 3.5 },
      { name: "voices1", gain: 0.4, delay: 2.9, stopAt: 3.5 },
      { name: "fire-roar", gain: 0.55, delay: 2.9, stopAt: 3.0 },
      { name: "motorcycle-rev", gain: 0.45, delay: 3.0, stopAt: 2.2 },
      { name: "motorcycle2", gain: 0.4, delay: 3.15, stopAt: 2.0 },
      { name: "metallic-click1", gain: 0.35, delay: 3.05 },
      { name: "metallic-click2", gain: 0.35, delay: 3.15 },
      { name: "bell-ding", gain: 0.3, delay: 3.25 },
      { name: "bell2", gain: 0.3, delay: 3.35 },
      { name: "metal-sword", gain: 0.4, delay: 3.1 },
      { name: "car-slam", gain: 0.4, delay: 3.15 },
      { name: "thunder-bass", gain: 0.6, delay: 3.2, stopAt: 2.4 },
    ]);
    setTimeout(() => voiceLine("fortune_favors_the_fearless"), 4300);
    setTimeout(() => voiceLine("whisper_again", { gain: 0.5 }), 5900);
  }

  // Sign In button press on the auth screens: electric whoosh, energy
  // surge, dark bass hit.
  function signInPress() {
    layer([
      { name: "electric-whoosh", gain: 0.6 },
      { name: "electric-charge", gain: 0.35, delay: 0.05, stopAt: 1.2 },
      { name: "bass-boom", gain: 0.55, delay: 0.08, stopAt: 1.4 },
    ]);
  }

  const ANTICIPATION_LINES = [
    "spin_if_you_dare", "feeling_lucky", "lets_see_what_fate_decides",
    "another_chance", "the_night_is_young", "the_house_trembles",
  ];

  function voiceLine(key, opts) {
    playVoice(key, opts);
  }

  function maybeVoiceLine(chance, key) {
    if (Math.random() < chance) voiceLine(key || pick(ANTICIPATION_LINES));
  }

  function start() {
    ensureCtx();
  }

  function setMuted(next) {
    muted = next;
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  }

  function isMuted() { return muted; }

  return {
    start, setMuted, isMuted, enterScene,
    spinStart, reelStop, winHit, cascadeSlam, multiplierHit,
    bonusTrigger, jackpot, signInPress,
    voiceLine, maybeVoiceLine,
    play, layer,
  };
})();
