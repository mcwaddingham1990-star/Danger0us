/*
  Active symbol set for Blue Diamonds.
  Curated subset of the uploaded art — kept around 8 total symbols so
  clusters on a 100-cell grid form at a reasonable rate (roughly one
  symbol type per 10-12 cells). More assets live in live/images/symbols/
  by tier if you want to expand this list later.
*/

const SYMBOL_SET = [
  { id: "moto-normal", tier: "normal", weight: 10, img: "images/symbols/normal/motorcycle-rear.jpg" },
  { id: "watch-normal", tier: "normal", weight: 10, img: "images/symbols/normal/watch-gold-black.jpg" },
  { id: "cash-normal", tier: "normal", weight: 10, img: "images/symbols/normal/cash-stack.jpg" },

  { id: "moto-blue", tier: "blue", weight: 6, img: "images/symbols/blue/motorcycle-glow.jpg" },
  { id: "lady-car-blue", tier: "blue", weight: 6, img: "images/symbols/blue/lady-car.jpg" },
  { id: "lady-champagne-blue", tier: "blue", weight: 6, img: "images/symbols/blue/lady-champagne.jpg" },

  { id: "lady-red", tier: "red", weight: 3, img: "images/symbols/red/lady-red.jpg" },

  { id: "jester", tier: "joker", weight: 0, img: "images/symbols/joker/joker-777.jpg", isWild: true },
];

const TIER_PAYTABLE = {
  normal: { small: 0.1, medium: 2, large: 20 },
  blue: { small: 0.5, medium: 5, large: 100 },
  red: { small: 2, medium: 25, large: 500 },
  joker: { small: 2, medium: 25, large: 500 },
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
