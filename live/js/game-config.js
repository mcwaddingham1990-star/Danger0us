/*
  Active symbol set for Blue Diamonds.
  Generic letters are the common, low-value filler (most of the board).
  Your uploaded photo symbols are rarer the further up the tier they go,
  and pay out more to match — joker is rarest/highest of all.
*/

const GRID_COLS = 8;
const GRID_ROWS = 9;

const SYMBOL_SET = [
  { id: "letter-a", tier: "generic", weight: 22, img: "images/symbols/generic/letter-a.svg" },
  { id: "letter-k", tier: "generic", weight: 22, img: "images/symbols/generic/letter-k.svg" },
  { id: "letter-q", tier: "generic", weight: 22, img: "images/symbols/generic/letter-q.svg" },
  { id: "letter-j", tier: "generic", weight: 22, img: "images/symbols/generic/letter-j.svg" },

  { id: "moto-normal", tier: "normal", weight: 5, img: "images/symbols/normal/motorcycle-rear.jpg" },
  { id: "watch-normal", tier: "normal", weight: 5, img: "images/symbols/normal/watch-gold-black.jpg" },
  { id: "cash-normal", tier: "normal", weight: 5, img: "images/symbols/normal/cash-stack.jpg" },

  { id: "moto-blue", tier: "blue", weight: 2.5, img: "images/symbols/blue/motorcycle-glow.jpg" },
  { id: "lady-car-blue", tier: "blue", weight: 2.5, img: "images/symbols/blue/lady-car.jpg" },
  { id: "lady-champagne-blue", tier: "blue", weight: 2.5, img: "images/symbols/blue/lady-champagne.jpg" },

  { id: "lady-red", tier: "red", weight: 1, img: "images/symbols/red/lady-red.jpg" },

  { id: "jester", tier: "joker", weight: 0, img: "images/symbols/joker/joker-777.jpg", isWild: true },
];

const TIER_PAYTABLE = {
  generic: { small: 0.05, medium: 1, large: 8 },
  normal: { small: 0.3, medium: 8, large: 60 },
  blue: { small: 1, medium: 15, large: 150 },
  red: { small: 3, medium: 40, large: 600 },
  joker: { small: 5, medium: 50, large: 750 },
};

function payoutMultiplierForCluster(tier, clusterSize) {
  const table = TIER_PAYTABLE[tier] || TIER_PAYTABLE.normal;
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
