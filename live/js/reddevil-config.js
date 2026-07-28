/*
  Active symbol set for Red Devil — same tiers/art as Blue Diamonds
  (silver/blue/red, plus the joker wild), but Red Devil is a 4x6
  payline game rather than a cluster-cascade game, so the rules below
  are a fixed-payline paytable instead of a cluster paytable, and there
  is no admin-tunable win probability — odds are fixed weights.
*/

const GRID_COLS = 4;
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

  // Devil wild — substitutes for anything on a payline. Fixed weight
  // (no admin override), and 3+ anywhere on the grid trigger Hellfire
  // Spins regardless of whether they land on a payline.
  { id: "jester", tier: "joker", weight: 1.1, imgs: [
    "images/symbols/joker/joker-777.jpg", "images/symbols/joker/joker-card.jpg",
  ], isWild: true },
];

function pickSymbolImage(sym) {
  if (!sym || !sym.imgs || sym.imgs.length === 0) return "";
  return sym.imgs[Math.floor(Math.random() * sym.imgs.length)];
}

/*
  Payline paytable — a run of 3 (reels 1-3) or 4 (reels 1-4) matching
  symbols starting from the leftmost reel, not a cluster anywhere on
  the board. Values are bet multiples for the whole line.
*/
const LINE_PAYTABLE = {
  "silver-letter": { three: 0.25, four: 1.5 },
  "silver-photo": { three: 0.6, four: 3.5 },
  "blue-letter": { three: 1.2, four: 7 },
  "blue-photo": { three: 2.5, four: 15 },
  "red-letter": { three: 5, four: 35 },
  "red-photo": { three: 10, four: 70 },
  joker: { three: 25, four: 150 },
};

function linePayoutMultiplier(tier, runLength) {
  const table = LINE_PAYTABLE[tier] || LINE_PAYTABLE["silver-photo"];
  return runLength >= 4 ? table.four : table.three;
}

// Each devil wild inside a winning run doubles that line's payout.
function wildLineMultiplier(wildCountInRun) {
  if (wildCountInRun >= 3) return 8;
  if (wildCountInRun === 2) return 4;
  if (wildCountInRun === 1) return 2;
  return 1;
}

/*
  Eight fixed paylines across the 4x6 grid: one per row, plus two
  zigzag "Hellfire" lines. Each entry is the row index (0-5) visited on
  each of the 4 reels, left to right.
*/
const PAYLINES = [
  [0, 0, 0, 0],
  [1, 1, 1, 1],
  [2, 2, 2, 2],
  [3, 3, 3, 3],
  [4, 4, 4, 4],
  [5, 5, 5, 5],
  [0, 1, 2, 1],
  [5, 4, 3, 4],
];

// Wild count anywhere on the grid (not just on a payline) needed to
// trigger Hellfire Spins, and how many spins that awards.
function hellfireSpinsForWildCount(count) {
  if (count >= 6) return 15;
  if (count === 5) return 10;
  if (count === 4) return 7;
  if (count >= 3) return 5;
  return 0;
}

// Hellfire Spins carry a rising multiplier instead of Blue Diamonds'
// cascade-count multiplier — it climbs by 1x every spin and caps at 10x.
function hellfireMultiplierForSpinIndex(spinIndex) {
  return Math.min(10, 1 + spinIndex);
}
