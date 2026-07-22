/*
  Shared client-side data layer for the Dangerous Rides prototype.
  Everything here is stored in localStorage, scoped to one browser.
  There is no server, so credits/settings are NOT shared across devices
  or between a real player and a real admin on different machines yet —
  this is a front-end prototype pending a real backend.
*/

const DR_KEYS = {
  session: "dr_session",
  players: "dr_players",
  settings: "dr_settings",
};

const DEFAULT_SETTINGS = {
  winProbability: 35,      // 0-100, chance-weighted RNG favors clusters forming
  jesterRate: 8,           // 0-100, how often jester/wild symbols appear
  avgFreeSpins: 15,        // baseline free spins on trigger
  multiplierFrequency: 50, // 0-100, how fast the cascade multiplier climbs
  jackpotChance: 1,        // 0-100
  clusterMin: 5,           // minimum touching symbols to pay
  columns: 8,
  rows: 10,
};

const SEED_ADMIN = {
  id: "admin-1",
  email: "WastedDrops1990",
  password: "Heather722!",
  role: "admin",
  credits: 0,
  timePlayingMinutes: 0,
  depositHistory: [],
  creditsPlayed: 0,
  creditsWon: 0,
  creditsLost: 0,
};

function drLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function drSave(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function drEnsureSeeded() {
  let players = drLoad(DR_KEYS.players, null);
  if (!players) {
    players = [SEED_ADMIN];
    drSave(DR_KEYS.players, players);
  } else {
    const idx = players.findIndex((p) => p.id === "admin-1");
    if (idx >= 0) {
      if (players[idx].email !== SEED_ADMIN.email || players[idx].password !== SEED_ADMIN.password) {
        players[idx] = Object.assign({}, players[idx], {
          email: SEED_ADMIN.email,
          password: SEED_ADMIN.password,
          role: "admin",
        });
        drSave(DR_KEYS.players, players);
      }
    } else {
      players.push(SEED_ADMIN);
      drSave(DR_KEYS.players, players);
    }
  }
  let settings = drLoad(DR_KEYS.settings, null);
  if (!settings) {
    drSave(DR_KEYS.settings, DEFAULT_SETTINGS);
  }
}

function drGetSettings() {
  drEnsureSeeded();
  return Object.assign({}, DEFAULT_SETTINGS, drLoad(DR_KEYS.settings, {}));
}

function drSaveSettings(partial) {
  const current = drGetSettings();
  const next = Object.assign({}, current, partial);
  drSave(DR_KEYS.settings, next);
  return next;
}

function drGetPlayers() {
  drEnsureSeeded();
  return drLoad(DR_KEYS.players, []);
}

function drSavePlayers(players) {
  drSave(DR_KEYS.players, players);
}

function drFindPlayer(email) {
  return drGetPlayers().find((p) => p.email.toLowerCase() === email.toLowerCase());
}

function drUpsertPlayer(player) {
  const players = drGetPlayers();
  const idx = players.findIndex((p) => p.email.toLowerCase() === player.email.toLowerCase());
  if (idx >= 0) {
    players[idx] = Object.assign({}, players[idx], player);
  } else {
    players.push(player);
  }
  drSavePlayers(players);
}

function drCreatePlayer(email) {
  const player = {
    id: "p-" + Date.now(),
    email,
    role: "player",
    credits: 500,
    timePlayingMinutes: 0,
    depositHistory: [{ amount: 500, at: Date.now(), note: "Starting credits" }],
    creditsPlayed: 0,
    creditsWon: 0,
    creditsLost: 0,
  };
  drUpsertPlayer(player);
  return player;
}

function drGetSession() {
  return drLoad(DR_KEYS.session, null);
}

function drSetSession(email) {
  drSave(DR_KEYS.session, { email, at: Date.now() });
}

function drClearSession() {
  localStorage.removeItem(DR_KEYS.session);
}

function drCurrentPlayer() {
  const session = drGetSession();
  if (!session) return null;
  return drFindPlayer(session.email) || null;
}

function drRequireSessionOrRedirect(redirectTo) {
  const session = drGetSession();
  if (!session) {
    window.location.href = redirectTo || "signin.html";
    return null;
  }
  return session;
}

function drAddCredits(email, amount) {
  const player = drFindPlayer(email);
  if (!player) return;
  player.credits = (player.credits || 0) + amount;
  player.depositHistory = player.depositHistory || [];
  player.depositHistory.push({ amount, at: Date.now(), note: "Admin credit add" });
  drUpsertPlayer(player);
}

drEnsureSeeded();
