/*
  Active symbol set for Blue Diamonds.

  Three color tiers (silver, blue, red), each with its own low-value
  letter cards and higher-value photo symbols — silver is the common
  filler, red is the rare high-payer, joker is rarest/highest of all.

  Symbols carry an `imgs` array rather than a single `img`: whenever a
  symbol is drawn on the board, pickSymbolImage() picks a random entry
  from that array, so repeated copies of e.g. "the silver motorcycle"
  don't all show the literal same photo. The array is what's matched
  for clustering (via `id`), not the specific image shown.
*/

const GRID_COLS = 6;
const GRID_ROWS = 6;

const SYMBOL_SET = [
  // Silver tier — most common, lowest pay.
  { id: "silver-letter-j", tier: "silver-letter", weight: 10, imgs: ["images/symbols/silver/letters/j.png"] },
  { id: "silver-letter-k", tier: "silver-letter", weight: 10, imgs: ["images/symbols/silver/letters/k.png"] },
  { id: "silver-letter-10", tier: "silver-letter", weight: 10, imgs: ["images/symbols/silver/letters/10.png"] },
  { id: "silver-letter-a", tier: "silver-letter", weight: 10, imgs: ["images/symbols/silver/letters/a.png"] },

  { id: "silver-moto", tier: "silver-photo", weight: 9, imgs: [
    "images/symbols/silver/photos/moto-1.png", "images/symbols/silver/photos/moto-2.png",
    "images/symbols/silver/photos/moto-3.png", "images/symbols/silver/photos/moto-4.png",
    "images/symbols/normal/motorcycle-rear.jpg", "images/symbols/normal/motorcycle-front.jpg",
  ] },
  { id: "silver-lady", tier: "silver-photo", weight: 9, imgs: [
    "images/symbols/silver/photos/lady-1.png", "images/symbols/silver/photos/lady-2.png",
    "images/symbols/silver/photos/lady-3.png", "images/symbols/silver/photos/lady-4.png",
    "images/symbols/normal/lady-blonde-bike.jpg", "images/symbols/normal/lady-brunette-bike.jpg",
  ] },
  { id: "silver-cash", tier: "silver-photo", weight: 9, imgs: [
    "images/symbols/silver/photos/cash-1.png", "images/symbols/silver/photos/cash-2.png",
    "images/symbols/silver/photos/cash-3.png", "images/symbols/silver/photos/cash-4.png",
    "images/symbols/normal/cash-stack.jpg",
  ] },
  { id: "silver-watch", tier: "silver-photo", weight: 9, imgs: [
    "images/symbols/silver/photos/watch-1.png", "images/symbols/silver/photos/watch-2.png",
    "images/symbols/silver/photos/watch-3.png", "images/symbols/silver/photos/watch-4.png",
    "images/symbols/normal/watch-gold-black.jpg", "images/symbols/normal/watch-blue-face.jpg",
    "images/symbols/normal/watch-rosegold-diamond.jpg", "images/symbols/normal/watch-silver-diamond.jpg",
  ] },

  // Blue tier — mid rarity, mid pay.
  { id: "blue-letter-j", tier: "blue-letter", weight: 4, imgs: ["images/symbols/blue/letters/j.png"] },
  { id: "blue-letter-k", tier: "blue-letter", weight: 4, imgs: ["images/symbols/blue/letters/k.png"] },
  { id: "blue-letter-10", tier: "blue-letter", weight: 4, imgs: ["images/symbols/blue/letters/10.png"] },

  { id: "blue-moto", tier: "blue-photo", weight: 5, imgs: [
    "images/symbols/blue/photos/moto-1.png", "images/symbols/blue/photos/moto-2.png", "images/symbols/blue/photos/moto-3.png",
    "images/symbols/blue/motorcycle-glow.jpg", "images/symbols/blue/motorcycle-armored-ref.jpg",
  ] },
  { id: "blue-lady", tier: "blue-photo", weight: 5, imgs: [
    "images/symbols/blue/photos/lady-1.png", "images/symbols/blue/photos/lady-2.png", "images/symbols/blue/photos/lady-3.png",
    "images/symbols/blue/lady-car.jpg", "images/symbols/blue/lady-champagne.jpg", "images/symbols/blue/lady-lingerie.jpg",
  ] },
  { id: "blue-cash", tier: "blue-photo", weight: 5, imgs: [
    "images/symbols/blue/photos/cash-1.png", "images/symbols/blue/photos/cash-2.png", "images/symbols/blue/photos/cash-3.png",
    "images/symbols/blue/cash-stack.jpg",
  ] },
  { id: "blue-watch", tier: "blue-photo", weight: 5, imgs: [
    "images/symbols/blue/photos/watch-1.png", "images/symbols/blue/photos/watch-2.png", "images/symbols/blue/photos/watch-3.png",
    "images/symbols/blue/watch.jpg",
  ] },

  // Red tier — rare, high pay.
  { id: "red-letter-j", tier: "red-letter", weight: 2, imgs: ["images/symbols/red/letters/j.png"] },
  { id: "red-letter-k", tier: "red-letter", weight: 2, imgs: ["images/symbols/red/letters/k.png"] },
  { id: "red-letter-a", tier: "red-letter", weight: 2, imgs: ["images/symbols/red/letters/a.png"] },

  { id: "red-moto", tier: "red-photo", weight: 2.5, imgs: [
    "images/symbols/red/photos/moto-1.png", "images/symbols/red/photos/moto-2.png", "images/symbols/red/photos/moto-3.png",
  ] },
  { id: "red-lady", tier: "red-photo", weight: 2.5, imgs: [
    "images/symbols/red/photos/lady-1.png", "images/symbols/red/photos/lady-2.png", "images/symbols/red/photos/lady-3.png",
    "images/symbols/red/lady-red.jpg",
  ] },
  { id: "red-cash", tier: "red-photo", weight: 2.5, imgs: [
    "images/symbols/red/photos/cash-1.png", "images/symbols/red/photos/cash-2.png", "images/symbols/red/photos/cash-3.png",
  ] },
  { id: "red-watch", tier: "red-photo", weight: 2.5, imgs: [
    "images/symbols/red/photos/watch-1.png", "images/symbols/red/photos/watch-2.png", "images/symbols/red/photos/watch-3.png",
  ] },

  // Wild — rarest/highest, appearance rate controlled separately by the
  // admin's Jester Appearance Rate setting, not this weight.
  { id: "jester", tier: "joker", weight: 0, imgs: [
    "images/symbols/joker/joker-777.jpg", "images/symbols/joker/joker-card.jpg",
  ], isWild: true },
];

function pickSymbolImage(sym) {
  if (!sym || !sym.imgs || sym.imgs.length === 0) return "";
  return sym.imgs[Math.floor(Math.random() * sym.imgs.length)];
}

// Rebalanced for the 6x6 (36-tile) board — a cluster of 25+ needed
// "large" on the old 64-tile board, which is 69% of the entire grid and
// basically unreachable on 36 tiles. Thresholds now scale with however
// many tiles the grid actually has, and payouts are cut to roughly the
// old 8x8 RTP (fewer tiles means clusters form less often, so each one
// pays more instead of paying the same amount more rarely).
const TIER_PAYTABLE = {
  "silver-letter": { small: 0.03, medium: 0.5, large: 4 },
  "silver-photo": { small: 0.15, medium: 4, large: 30 },
  "blue-letter": { small: 0.3, medium: 6, large: 50 },
  "blue-photo": { small: 0.5, medium: 8, large: 75 },
  "red-letter": { small: 1, medium: 13, large: 150 },
  "red-photo": { small: 1.5, medium: 20, large: 300 },
  joker: { small: 2.5, medium: 25, large: 375 },
};

function payoutMultiplierForCluster(tier, clusterSize) {
  const table = TIER_PAYTABLE[tier] || TIER_PAYTABLE["silver-photo"];
  const totalCells = GRID_COLS * GRID_ROWS;
  const largeThreshold = Math.max(8, Math.round(totalCells * 0.390625)); // 25/64 on the original board
  const mediumThreshold = Math.max(6, Math.round(totalCells * 0.15625)); // 10/64 on the original board
  if (clusterSize >= largeThreshold) return table.large;
  if (clusterSize >= mediumThreshold) return table.medium;
  return table.small;
}

function freeSpinsForJesterCount(count) {
  if (count >= 6) return 50;
  if (count === 5) return 30;
  if (count === 4) return 15;
  if (count === 3) return 5;
  return 0;
}

function cascadeMultiplier(cascadeCount) {
  if (cascadeCount >= 10) return 10;
  if (cascadeCount >= 5) return 5;
  if (cascadeCount >= 3) return 3;
  if (cascadeCount >= 1) return 2;
  return 1;
}

function jesterWildMultiplier(jesterCountOnBoard) {
  if (jesterCountOnBoard >= 3) return 10;
  if (jesterCountOnBoard === 2) return 5;
  if (jesterCountOnBoard === 1) return 2;
  return 1;
}
