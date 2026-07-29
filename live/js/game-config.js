/*
  Blue Diamonds — central game configuration.

  Every number that drives math, odds, or feature thresholds lives here.
  game-engine.js reads from this file only; nothing outside this file
  should hardcode a payout, probability, or threshold. That's a direct
  requirement from the design brief ("keep all math configurable in one
  central configuration file... do not scatter payout values throughout
  the code").

  Asset note: the brief asks for three versions (Plain/Red/Blue) of every
  symbol, using the existing art. The existing image folders already are
  exactly those three tiers (silver/red/blue), for four photo families
  (moto, lady, cash, watch) plus two letters (J, K) that have complete
  three-tier coverage. Only the joker and the bonus-trigger symbol have a
  single piece of art each — those are reused across tiers/purposes and
  told apart with a CSS glow color + badge instead of separate art.
*/

const GRID_COLS = 6;
const GRID_ROWS = 6;
const BONUS_COLS = 10;
const BONUS_ROWS = 10;

const MIN_BET = 0.1;
const MAX_BET = 100;
// Discrete bet steps per the brief — Min/Max/+/- all walk this list
// instead of a continuous +/- 0.1 increment.
const BET_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 75, 100];

// Minimum touching (orthogonal-only) same-family symbols to pay.
const CLUSTER_MIN_FLOOR = 5;

/*
  Symbol families. Every family carries plain/red/blue image arrays.
  `payWeight` is the Low/Medium/High/Premium value hierarchy from the
  brief (1.0 / 1.5 / 2.5 / 4.0) — used in the payout formula, not for RNG
  odds. `rngWeight` is this family's relative pick frequency, independent
  of payWeight — letters show up a lot more often than the flagship
  motorcycle regardless of how much each is worth.
*/
const FAMILIES = [
  { id: "letter-j", tier: "low", payWeight: 1.0, rngWeight: 10,
    imgs: { plain: ["images/symbols/silver/letters/j.png"], red: ["images/symbols/red/letters/j.png"], blue: ["images/symbols/blue/letters/j.png"] } },
  { id: "letter-k", tier: "low", payWeight: 1.0, rngWeight: 10,
    imgs: { plain: ["images/symbols/silver/letters/k.png"], red: ["images/symbols/red/letters/k.png"], blue: ["images/symbols/blue/letters/k.png"] } },
  { id: "cash", tier: "medium", payWeight: 1.5, rngWeight: 7,
    imgs: {
      plain: ["images/symbols/silver/photos/cash-1.png", "images/symbols/silver/photos/cash-2.png", "images/symbols/silver/photos/cash-3.png", "images/symbols/silver/photos/cash-4.png", "images/symbols/normal/cash-stack.jpg"],
      red: ["images/symbols/red/photos/cash-1.png", "images/symbols/red/photos/cash-2.png", "images/symbols/red/photos/cash-3.png"],
      blue: ["images/symbols/blue/photos/cash-1.png", "images/symbols/blue/photos/cash-2.png", "images/symbols/blue/photos/cash-3.png"],
    } },
  { id: "watch", tier: "medium", payWeight: 1.5, rngWeight: 7,
    imgs: {
      plain: ["images/symbols/silver/photos/watch-1.png", "images/symbols/silver/photos/watch-2.png", "images/symbols/silver/photos/watch-3.png", "images/symbols/silver/photos/watch-4.png", "images/symbols/normal/watch-gold-black.jpg", "images/symbols/normal/watch-blue-face.jpg", "images/symbols/normal/watch-rosegold-diamond.jpg", "images/symbols/normal/watch-silver-diamond.jpg"],
      red: ["images/symbols/red/photos/watch-1.png", "images/symbols/red/photos/watch-2.png", "images/symbols/red/photos/watch-3.png"],
      blue: ["images/symbols/blue/photos/watch-1.png", "images/symbols/blue/photos/watch-2.png", "images/symbols/blue/photos/watch-3.png"],
    } },
  { id: "lady", tier: "high", payWeight: 2.5, rngWeight: 4,
    imgs: {
      plain: ["images/symbols/silver/photos/lady-1.png", "images/symbols/silver/photos/lady-2.png", "images/symbols/silver/photos/lady-3.png", "images/symbols/silver/photos/lady-4.png", "images/symbols/normal/lady-blonde-bike.jpg", "images/symbols/normal/lady-brunette-bike.jpg"],
      red: ["images/symbols/red/photos/lady-1.png", "images/symbols/red/photos/lady-2.png", "images/symbols/red/photos/lady-3.png", "images/symbols/red/lady-red.jpg"],
      blue: ["images/symbols/blue/photos/lady-1.png", "images/symbols/blue/photos/lady-2.png", "images/symbols/blue/photos/lady-3.png", "images/symbols/blue/lady-car.jpg", "images/symbols/blue/lady-champagne.jpg", "images/symbols/blue/lady-lingerie.jpg"],
    } },
  { id: "moto", tier: "premium", payWeight: 4.0, rngWeight: 2.5,
    imgs: {
      plain: ["images/symbols/silver/photos/moto-1.png", "images/symbols/silver/photos/moto-2.png", "images/symbols/silver/photos/moto-3.png", "images/symbols/silver/photos/moto-4.png", "images/symbols/normal/motorcycle-rear.jpg", "images/symbols/normal/motorcycle-front.jpg"],
      red: ["images/symbols/red/photos/moto-1.png", "images/symbols/red/photos/moto-2.png", "images/symbols/red/photos/moto-3.png"],
      blue: ["images/symbols/blue/photos/moto-1.png", "images/symbols/blue/photos/moto-2.png", "images/symbols/blue/photos/moto-3.png", "images/symbols/blue/motorcycle-glow.jpg", "images/symbols/blue/motorcycle-armored-ref.jpg"],
    } },
];

// Color-tier value multiplier (applied to each symbol's contribution to a
// cluster's color score) and relative RNG rarity (plain most common, blue
// rarest — inverse of value, standard slot design).
const COLOR_TIERS = {
  plain: { valueMult: 1, rngShare: 1.0 },
  red: { valueMult: 3, rngShare: 0.35 },
  blue: { valueMult: 7, rngShare: 0.12 },
};

// Joker (wild) tiers. A Joker joins whichever adjacent family cluster it
// helps pay the most (resolved in the engine). `rngShare` splits however
// many jokers the jesterRate setting produces across the three tiers.
const JOKER_TIERS = {
  plain: { valueMult: 3, rngShare: 0.70 },
  red: { valueMult: 7, rngShare: 0.25, cascadeBonus: 1 },
  blue: { valueMult: 15, rngShare: 0.05, cascadeBonus: 2 },
};

// Single reused art asset for all three Joker tiers — no color-tiered
// joker art exists, so tiers are told apart with a glow color + badge.
const JOKER_IMGS = ["images/symbols/joker/joker-777.jpg"];

// Bonus/scatter trigger symbol — doesn't join clusters, doesn't pay on
// its own, just counts toward the free-spin trigger/retrigger tables.
// Reuses the other existing joker asset so nothing new had to be drawn.
const BONUS_SYMBOL_IMGS = ["images/symbols/joker/joker-card.jpg"];
const BONUS_SYMBOL_RNG_WEIGHT = 1.4;

// Cluster-size payout multiplier — applied to (bet x symbol payWeight x
// average color value x cascade multiplier x joker effects).
const CLUSTER_SIZE_MULTIPLIERS = [
  { min: 5, max: 5, mult: 0.10 },
  { min: 6, max: 6, mult: 0.15 },
  { min: 7, max: 7, mult: 0.25 },
  { min: 8, max: 8, mult: 0.40 },
  { min: 9, max: 9, mult: 0.60 },
  { min: 10, max: 10, mult: 0.85 },
  { min: 11, max: 12, mult: 1.25 },
  { min: 13, max: 14, mult: 1.75 },
  { min: 15, max: 17, mult: 2.50 },
  { min: 18, max: 20, mult: 4 },
  { min: 21, max: 24, mult: 6 },
  { min: 25, max: 29, mult: 10 },
  { min: 30, max: 35, mult: 18 },
  { min: 36, max: Infinity, mult: 40 },
];

// Single global RTP lever. The cluster-size/color/joker formula above is
// exactly what the brief specified; simulating it landed base-game RTP
// around 128%. Nothing forces a "certified" RTP for a private app like
// this, so the actual numbers are left as specified — but everything
// funnels through this one multiplier so it can be tuned in one place
// later without touching the formula itself. 1 = unscaled.
const PAYOUT_SCALE = 1;

const CASCADE = {
  baseCap: 10,       // base-game cascade multiplier cap
  bonusCap: 999,      // bonus multiplier is not meant to meaningfully cap
  bonusMilestones: [5, 10, 15, 20, 25, 50],
  fullGridBonusBoost: 5, // bonus-mode full/near-full clear bonus (Full-Grid Blue Inferno)
};

const HEAT = {
  base: {
    plainWin: 1, redWin: 3, blueWin: 7,
    plainJoker: 10, redJoker: 20, blueJoker: 35,
    perExtraCascade: 5,
    threshold: 100,
  },
  bonus: {
    plainWin: 1, redWin: 3, blueWin: 7,
    plainJoker: 10, redJoker: 20, blueJoker: 35,
    perExtraCascade: 5,
    threshold: 60, // "Blue Overdrive requires less heat" in bonus
  },
};

const OVERDRIVE = {
  cascadeMultiplierBoost: 2,
  plainToRedUpgrades: 3,
  redToBlueUpgrades: 2,
  guaranteedJokerNextCascade: true,
};

// Base-game bonus (free spins) trigger, by count of Bonus symbols landed
// on the initial drop.
const BONUS_TRIGGER = [
  { count: 3, spins: 8 },
  { count: 4, spins: 10 },
  { count: 5, spins: 12 }, // 5 or more
];

// Retrigger table — Bonus symbols landing on a single free-spin's drop
// during the bonus round.
const BONUS_RETRIGGER = [
  { count: 3, spins: 2 },
  { count: 4, spins: 3 },
  { count: 5, spins: 5 }, // 5 or more
];

// Extra spins awarded for an exceptional single cluster during the bonus
// round (not the full-grid case — that's Full-Grid Blue Inferno below,
// kept separate so the same win is never credited twice).
const BONUS_EXTRA_SPINS_BY_CLUSTER = [
  { min: 20, max: 29, spins: 1, chance: 0.5 },
  { min: 30, max: 49, spins: 1, chance: 1 },
  { min: 50, max: 74, spins: 2, chance: 1 },
  { min: 75, max: 99, spins: 3, chance: 1 },
];

const FULL_GRID_INFERNO = {
  minClearFraction: 1.0, // 100 of 100 bonus-grid cells in one cascade step
  multiplierBoost: 10,
  extraSpins: 5,
};

// Bonus round intensity levels, derived from the *current* persistent
// bonus cascade multiplier (not tracked separately).
const DEATH_RIDE_LEVELS = [
  { level: 1, name: "THE GATES OPEN", min: 1, max: 4 },
  { level: 2, name: "THE JESTER AWAKENS", min: 5, max: 9 },
  { level: 3, name: "BLUE INFERNO", min: 10, max: 19 },
  { level: 4, name: "DEATH RIDE OVERDRIVE", min: 20, max: Infinity },
];

const JESTER_TAKEOVER = {
  chancePerBonusSpin: 0.12,
  levels: [
    { name: "minor", weight: 60, upgrades: [3, 5], jokers: 0 },
    { name: "major", weight: 32, upgrades: [6, 12], jokers: 1 },
    { name: "total", weight: 8, upgrades: [10, 16], jokers: 2, multiplierBoost: 3 },
  ],
};

const JOKER_CHAIN = {
  perExtraJokerMultiplierBoost: 1, // per joker beyond the first, in one cluster
  blueJesterDeathRide: {
    requiredBlueJokers: 3,
    multiplierBoost: 10,
  },
};

// Win presentation tiers, relative to the spin's total bet.
const BIG_WIN_TIERS = [
  { name: "BIG WIN", mult: 10 },
  { name: "MEGA WIN", mult: 25 },
  { name: "INSANE WIN", mult: 50 },
  { name: "DEATH RIDE WIN", mult: 100 },
];

function symbolImage(family, color) {
  const pool = family.imgs[color];
  return pool[Math.floor(Math.random() * pool.length)];
}

function familyById(id) {
  return FAMILIES.find((f) => f.id === id);
}

function clusterSizeMultiplier(size) {
  const row = CLUSTER_SIZE_MULTIPLIERS.find((r) => size >= r.min && size <= r.max);
  return row ? row.mult : CLUSTER_SIZE_MULTIPLIERS[CLUSTER_SIZE_MULTIPLIERS.length - 1].mult;
}

function deathRideLevelFor(multiplier) {
  return DEATH_RIDE_LEVELS.find((l) => multiplier >= l.min && multiplier <= l.max) || DEATH_RIDE_LEVELS[0];
}

function bigWinTierFor(winAmount, betAmount) {
  if (betAmount <= 0) return null;
  const ratio = winAmount / betAmount;
  let tier = null;
  BIG_WIN_TIERS.forEach((t) => { if (ratio >= t.mult) tier = t; });
  return tier;
}
