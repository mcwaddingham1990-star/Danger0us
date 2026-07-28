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

const TIER_PAYTABLE = {
  "silver-letter": { small: 0.05, medium: 1, large: 8 },
  "silver-photo": { small: 0.3, medium: 8, large: 60 },
  "blue-letter": { small: 0.6, medium: 12, large: 100 },
  "blue-photo": { small: 1, medium: 15, large: 150 },
  "red-letter": { small: 2, medium: 25, large: 300 },
  "red-photo": { small: 3, medium: 40, large: 600 },
  joker: { small: 5, medium: 50, large: 750 },
};

function payoutMultiplierForCluster(tier, clusterSize) {
  const table = TIER_PAYTABLE[tier] || TIER_PAYTABLE["silver-photo"];
  if (clusterSize >= 25) return table.large;
  if (clusterSize >= 10) return table.medium;
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
