function symbolById(id) {
  return SYMBOL_SET.find((s) => s.id === id);
}

function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.symbol;
  }
  return pool[pool.length - 1].symbol;
}

// Shares the same admin settings as Blue Diamonds: winProbability biases
// 1-2 favored tiers heavier (same shape as Blue Diamonds' clusterBoost,
// just applied to line-paying tiers instead of clusters), jesterRate
// scales the wild's weight instead of Red Devil's old fixed 1.1.
function pickFavoredTiers() {
  const tiers = Array.from(new Set(SYMBOL_SET.filter((s) => !s.isWild).map((s) => s.tier)));
  return tiers.sort(() => Math.random() - 0.5).slice(0, 2);
}

function buildPool(settings, favoredTiers) {
  settings = settings || {};
  favoredTiers = favoredTiers || [];
  const clusterBoost = 1 + ((settings.winProbability != null ? settings.winProbability : 10) / 100) * 2.5;
  const jesterRate = settings.jesterRate != null ? settings.jesterRate : 3;
  const wildWeight = Math.max(0.2, (jesterRate / 100) * 8);

  return SYMBOL_SET.map((s) => {
    if (s.isWild) return { symbol: s, weight: wildWeight };
    const weight = favoredTiers.includes(s.tier) ? s.weight * clusterBoost : s.weight;
    return { symbol: s, weight };
  });
}

function generateGrid(cols, rows, settings) {
  const pool = buildPool(settings, pickFavoredTiers());
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(weightedPick(pool).id);
    }
    grid.push(row);
  }
  return grid;
}

/*
  Mirrors Blue Diamonds' old "winProbability 0 means guaranteed no wins"
  behavior: when the admin sets Win Probability to exactly 0, actively
  break any payline run that formed by chance instead of just relying on
  low weights (which can still pay sometimes). Mutates grid in place.
*/
function suppressLineWins(grid, cols, rows) {
  let guard = 0;
  while (guard < 200) {
    const wins = evaluateLines(grid, cols, rows);
    if (wins.length === 0) break;
    wins.forEach((w) => {
      const [r, c] = w.cells[Math.floor(w.cells.length / 2)];
      const currentTier = (symbolById(grid[r][c]) || {}).tier;
      const replacement = SYMBOL_SET.find((s) => !s.isWild && s.tier !== currentTier);
      if (replacement) grid[r][c] = replacement.id;
    });
    guard++;
  }
}

function countWilds(grid, cols, rows) {
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((symbolById(grid[r][c]) || {}).isWild) count++;
    }
  }
  return count;
}

/*
  Evaluates all PAYLINES against a static grid (no cascades in Red
  Devil). A line pays when reels 1-3 (or all 4) match the same symbol
  *tier* left to right (e.g. any silver-letter card matches any other
  silver-letter card, same as the silver/blue/red groupings Blue
  Diamonds already pays by), with wilds substituting freely.
*/
function evaluateLines(grid, cols, rows) {
  const wins = [];

  PAYLINES.forEach((line, lineIndex) => {
    const rowsAtReel = line.slice(0, cols);
    const cellIds = rowsAtReel.map((row, c) => grid[row][c]);
    const cellSyms = cellIds.map((id) => symbolById(id));

    let baseTier = null;
    let runLength = 0;
    for (let c = 0; c < cellSyms.length; c++) {
      const sym = cellSyms[c];
      if (sym.isWild) {
        runLength++;
        continue;
      }
      if (baseTier === null) {
        baseTier = sym.tier;
        runLength++;
        continue;
      }
      if (sym.tier === baseTier) {
        runLength++;
        continue;
      }
      break;
    }

    if (baseTier === null) baseTier = "joker"; // an all-wild run
    if (runLength < 3) return;

    const cells = [];
    let wildCount = 0;
    for (let c = 0; c < runLength; c++) {
      cells.push([rowsAtReel[c], c]);
      if (cellSyms[c].isWild) wildCount++;
    }

    const payMult = linePayoutMultiplier(baseTier, runLength);
    const lineMult = wildLineMultiplier(wildCount);

    wins.push({
      lineIndex,
      tier: baseTier,
      runLength,
      cells,
      wildCount,
      multiplierUnits: payMult * lineMult,
    });
  });

  return wins;
}

/*
  Resolves one spin: a single grid, evaluated once (no cascades). If
  hellfireMultiplier is passed (during Hellfire Spins), every winning
  line's payout is scaled by it on top of the wild-stack multiplier.
*/
function resolveSpin(cols, rows, settings, options) {
  settings = settings || {};
  options = options || {};
  const hellfireMultiplier = options.hellfireMultiplier || 1;

  const grid = generateGrid(cols, rows, settings);
  if ((settings.winProbability || 0) <= 0) {
    suppressLineWins(grid, cols, rows);
  }
  const wins = evaluateLines(grid, cols, rows);
  const wildCount = countWilds(grid, cols, rows);

  let totalMultiplierUnits = 0;
  let biggestRun = 0;
  wins.forEach((w) => {
    totalMultiplierUnits += w.multiplierUnits * hellfireMultiplier;
    biggestRun = Math.max(biggestRun, w.runLength);
  });

  return { grid, wins, wildCount, totalMultiplierUnits, biggestRun };
}
