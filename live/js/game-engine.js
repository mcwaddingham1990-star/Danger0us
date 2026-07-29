/*
  Blue Diamonds — game engine.

  Pure game math/state, no DOM. game.js renders whatever this produces
  and never computes a payout itself. Every constant lives in
  game-config.js.

  Cell shapes on the grid:
    { kind: "symbol", family: "moto", color: "plain"|"red"|"blue" }
    { kind: "joker", tier: "plain"|"red"|"blue" }
    { kind: "bonus" }   -- scatter; never joins a cluster

  Interpretive notes on the design brief (documented here since the brief
  reads like a creative spec, not literal pseudocode):
  - "average color value" in the final-award formula is the cluster's
    total color score (sum of each cell's color/joker value multiplier)
    divided by cluster size — using the raw total would double-count
    size, since cluster-size multiplier already scales for that.
  - "Joker effects" is treated as an additional small multiplicative
    kicker per joker in the cluster (on top of the joker's own
    contribution to the color score), so a joker helps a win two ways:
    it raises the average color value like a rare symbol would, and it
    adds a bit more on top for being a wild.
  - A cascade's "active cascade multiplier" is the persistent counter
    (see resolveSpin) plus any Red/Red-Joker/Blue-Joker cascade bonus
    earned by THIS step only (temporary, does not compound forward).
*/

function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.value;
  }
  return pool[pool.length - 1].value;
}

function pickFavoredFamilies() {
  return FAMILIES.slice().sort(() => Math.random() - 0.5).slice(0, 2).map((f) => f.id);
}

/*
  Builds the weighted pool of possible cells for one grid slot.
  `favoredIds` gets an rngWeight boost from winProbability, same spirit
  as the old engine's cluster-forming bias. `jokerRate`/`bonusBoost` let
  bonus mode run hotter per the brief ("more Red and Blue symbols
  appear... Joker frequency is increased").
*/
function buildCellPool(settings, favoredIds, opts) {
  opts = opts || {};
  const clusterBoost = 1 + (settings.winProbability / 100) * 2.5;
  const jesterRate = opts.jesterRateOverride != null ? opts.jesterRateOverride : settings.jesterRate;
  const totalJokerWeight = Math.max(0.2, (jesterRate / 100) * 8) * (opts.jokerRateMultiplier || 1);
  const bonusSymbolWeight = BONUS_SYMBOL_RNG_WEIGHT * (opts.includeBonusSymbol === false ? 0 : 1);

  const pool = [];

  FAMILIES.forEach((family) => {
    const famBoost = favoredIds.includes(family.id) ? clusterBoost : 1;
    Object.keys(COLOR_TIERS).forEach((color) => {
      let colorShare = COLOR_TIERS[color].rngShare;
      if (opts.redBlueBoost && color !== "plain") colorShare *= opts.redBlueBoost;
      const weight = family.rngWeight * colorShare * famBoost;
      pool.push({ weight, value: { kind: "symbol", family: family.id, color } });
    });
  });

  Object.keys(JOKER_TIERS).forEach((tier) => {
    const weight = totalJokerWeight * JOKER_TIERS[tier].rngShare;
    if (weight > 0) pool.push({ weight, value: { kind: "joker", tier } });
  });

  if (bonusSymbolWeight > 0) {
    pool.push({ weight: bonusSymbolWeight, value: { kind: "bonus" } });
  }

  return pool;
}

function generateGrid(cols, rows, settings, opts) {
  const favored = pickFavoredFamilies();
  const pool = buildCellPool(settings, favored, opts);
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push(weightedPick(pool));
    grid.push(row);
  }
  return grid;
}

function fillEmpty(grid, cols, rows, settings, opts) {
  const favored = pickFavoredFamilies();
  const pool = buildCellPool(settings, favored, opts);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] === null) grid[r][c] = weightedPick(pool);
    }
  }
}

function cellFamily(cell) { return cell && cell.kind === "symbol" ? cell.family : null; }
function isJoker(cell) { return !!cell && cell.kind === "joker"; }
function isBonus(cell) { return !!cell && cell.kind === "bonus"; }

function cellColorValueMult(cell) {
  if (!cell) return 0;
  if (cell.kind === "symbol") return COLOR_TIERS[cell.color].valueMult;
  if (cell.kind === "joker") return JOKER_TIERS[cell.tier].valueMult;
  return 0;
}

function neighbors(r, c, rows, cols) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(
    ([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols
  );
}

/*
  Scores one candidate cluster (before final joker-ownership resolution)
  so competing candidates that share a joker can be compared. Mirrors
  computeClusterAward's shape but only needs to be relatively accurate,
  not final.
*/
function estimateClusterValue(cells, grid, family) {
  let colorScore = 0;
  cells.forEach(([r, c]) => { colorScore += cellColorValueMult(grid[r][c]); });
  const avgColor = colorScore / cells.length;
  return family.payWeight * clusterSizeMultiplier(cells.length) * avgColor;
}

/*
  Finds every winning cluster on the grid, resolving shared-Joker
  ownership toward whichever candidate cluster pays the most (per the
  brief: "A Joker joins the neighboring matching cluster that produces
  the highest valid award").
*/
function findClusters(grid, cols, rows, minSize) {
  const floor = Math.max(CLUSTER_MIN_FLOOR, minSize || CLUSTER_MIN_FLOOR);

  // Pass 1: one flood-fill per family, cells participate if they're that
  // family or a joker. Produces candidate clusters that may share joker
  // cells with a DIFFERENT family's candidate.
  const candidates = []; // { familyId, cells: [[r,c]...] }
  FAMILIES.forEach((family) => {
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (visited[r][c]) continue;
        const cell = grid[r][c];
        const matchesFamily = cellFamily(cell) === family.id;
        if (!matchesFamily) { visited[r][c] = true; continue; }

        const stack = [[r, c]];
        const cells = [];
        const localSeen = new Set([r + "," + c]);
        visited[r][c] = true;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          cells.push([cr, cc]);
          neighbors(cr, cc, rows, cols).forEach(([nr, nc]) => {
            const key = nr + "," + nc;
            if (localSeen.has(key)) return;
            const nCell = grid[nr][nc];
            if (cellFamily(nCell) === family.id || isJoker(nCell)) {
              localSeen.add(key);
              if (cellFamily(nCell) === family.id) visited[nr][nc] = true;
              stack.push([nr, nc]);
            }
          });
        }

        const hasReal = cells.some(([cr, cc]) => cellFamily(grid[cr][cc]) === family.id);
        if (hasReal && cells.length >= floor) {
          candidates.push({ familyId: family.id, family, cells });
        }
      }
    }
  });

  // Pass 2: find joker cells shared by 2+ candidates and award each such
  // joker to whichever candidate currently scores highest.
  const jokerOwners = new Map(); // "r,c" -> candidate index
  candidates.forEach((cand, idx) => {
    const estValue = estimateClusterValue(cand.cells, grid, cand.family);
    cand.cells.forEach(([r, c]) => {
      if (!isJoker(grid[r][c])) return;
      const key = r + "," + c;
      const existing = jokerOwners.get(key);
      if (!existing || estValue > existing.value) {
        jokerOwners.set(key, { idx, value: estValue });
      }
    });
  });

  // Pass 3: rebuild each candidate keeping only its real cells plus
  // jokers it actually won ownership of. Stripping a contested joker can
  // split what was one connected shape into two or more pieces (the
  // joker was the only bridge between them) — re-flood-fill the survivors
  // and keep each resulting piece as its own cluster, only if it still
  // meets the floor and still has a real cell of this family.
  const finalClusters = [];
  candidates.forEach((cand, idx) => {
    const keptSet = new Set();
    cand.cells.forEach(([r, c]) => {
      const cell = grid[r][c];
      const owns = !isJoker(cell) || (jokerOwners.get(r + "," + c) || {}).idx === idx;
      if (owns) keptSet.add(r + "," + c);
    });

    const seen = new Set();
    keptSet.forEach((key) => {
      if (seen.has(key)) return;
      const [sr, sc] = key.split(",").map(Number);
      const stack = [[sr, sc]];
      seen.add(key);
      const piece = [];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        piece.push([cr, cc]);
        neighbors(cr, cc, rows, cols).forEach(([nr, nc]) => {
          const nKey = nr + "," + nc;
          if (keptSet.has(nKey) && !seen.has(nKey)) {
            seen.add(nKey);
            stack.push([nr, nc]);
          }
        });
      }
      const hasReal = piece.some(([pr, pc]) => cellFamily(grid[pr][pc]) === cand.familyId);
      if (hasReal && piece.length >= floor) {
        finalClusters.push({ familyId: cand.familyId, family: cand.family, cells: piece });
      }
    });
  });

  return finalClusters;
}

/*
  Final award for one resolved cluster. `cascadeMultiplierBase` is the
  persistent counter; this returns both the credited amount and the
  temporary cascade-multiplier bonus this cluster earned (Red/Blue Joker
  cascade bonus + Joker Chain Reaction), which the caller folds into the
  running multiplier display for this step only.
*/
function computeClusterAward(cluster, grid, betAmount, cascadeMultiplierBase) {
  const cells = cluster.cells;
  let colorScore = 0;
  let redJokers = 0, blueJokers = 0, plainJokers = 0;
  let jokerEffectsMult = 1;

  cells.forEach(([r, c]) => {
    const cell = grid[r][c];
    colorScore += cellColorValueMult(cell);
    if (isJoker(cell)) {
      if (cell.tier === "red") { redJokers++; jokerEffectsMult += 0.15; }
      else if (cell.tier === "blue") { blueJokers++; jokerEffectsMult += 0.35; }
      else { plainJokers++; jokerEffectsMult += 0.05; }
    }
  });

  const totalJokers = redJokers + blueJokers + plainJokers;
  let cascadeBonus = redJokers * JOKER_TIERS.red.cascadeBonus + blueJokers * JOKER_TIERS.blue.cascadeBonus;

  let chainReaction = false;
  let blueJesterDeathRide = false;
  if (totalJokers >= 2) {
    chainReaction = true;
    cascadeBonus += (totalJokers - 1) * JOKER_CHAIN.perExtraJokerMultiplierBoost;
  }
  if (blueJokers >= JOKER_CHAIN.blueJesterDeathRide.requiredBlueJokers) {
    blueJesterDeathRide = true;
    cascadeBonus += JOKER_CHAIN.blueJesterDeathRide.multiplierBoost;
  }

  const avgColorValue = colorScore / cells.length;
  const sizeMult = clusterSizeMultiplier(cells.length);
  const effectiveCascadeMult = cascadeMultiplierBase + cascadeBonus;

  const award = PAYOUT_SCALE * betAmount * cluster.family.payWeight * sizeMult * avgColorValue * effectiveCascadeMult * jokerEffectsMult;

  return {
    award,
    cells,
    familyId: cluster.familyId,
    size: cells.length,
    colorScore,
    avgColorValue,
    sizeMult,
    jokerEffectsMult,
    cascadeBonus,
    effectiveCascadeMult,
    redJokers, blueJokers, plainJokers,
    chainReaction, blueJesterDeathRide,
  };
}

function applyGravity(grid, cols, rows) {
  for (let c = 0; c < cols; c++) {
    const colVals = [];
    for (let r = rows - 1; r >= 0; r--) if (grid[r][c] !== null) colVals.push(grid[r][c]);
    for (let r = rows - 1; r >= 0; r--) {
      const idx = rows - 1 - r;
      grid[r][c] = idx < colVals.length ? colVals[idx] : null;
    }
  }
}

function countBonusSymbols(grid, cols, rows) {
  let count = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (isBonus(grid[r][c])) count++;
  return count;
}

function bonusTriggerSpins(count) {
  let spins = 0;
  BONUS_TRIGGER.forEach((row) => { if (count >= row.count) spins = row.spins; });
  return spins;
}

function bonusRetriggerSpins(count) {
  let spins = 0;
  BONUS_RETRIGGER.forEach((row) => { if (count >= row.count) spins = row.spins; });
  return spins;
}

function extraSpinsForCluster(size) {
  const row = BONUS_EXTRA_SPINS_BY_CLUSTER.find((r) => size >= r.min && size <= r.max);
  if (!row) return 0;
  if (row.chance >= 1 || Math.random() < row.chance) return row.spins;
  return 0;
}

/*
  Applies Jester Takeover / Blue Overdrive style upgrades directly to the
  grid: promotes N random plain cells to red and/or M random red cells to
  blue, and can drop guaranteed jokers into empty-ish (non-bonus) cells.
  Mutates and returns counts for the UI to narrate.
*/
function applyUpgrades(grid, cols, rows, plainToRed, redToBlue, jokersToAdd, jokerTier) {
  const plainCells = [];
  const redCells = [];
  const otherCells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell && cell.kind === "symbol" && cell.color === "plain") plainCells.push([r, c]);
      else if (cell && cell.kind === "symbol" && cell.color === "red") redCells.push([r, c]);
      if (!cell || cell.kind === "symbol") otherCells.push([r, c]);
    }
  }
  const shuffledPlain = plainCells.sort(() => Math.random() - 0.5).slice(0, plainToRed);
  shuffledPlain.forEach(([r, c]) => { grid[r][c] = Object.assign({}, grid[r][c], { color: "red" }); });

  const shuffledRed = redCells.sort(() => Math.random() - 0.5).slice(0, redToBlue);
  shuffledRed.forEach(([r, c]) => { grid[r][c] = Object.assign({}, grid[r][c], { color: "blue" }); });

  const jokerSpots = otherCells.filter(([r, c]) => grid[r][c] && grid[r][c].kind === "symbol").sort(() => Math.random() - 0.5).slice(0, jokersToAdd);
  jokerSpots.forEach(([r, c]) => { grid[r][c] = { kind: "joker", tier: jokerTier || "plain" }; });

  return { upgraded: shuffledPlain.length + shuffledRed.length, jokersAdded: jokerSpots.length };
}

function rollJesterTakeover() {
  if (Math.random() >= JESTER_TAKEOVER.chancePerBonusSpin) return null;
  const total = JESTER_TAKEOVER.levels.reduce((s, l) => s + l.weight, 0);
  let r = Math.random() * total;
  for (const level of JESTER_TAKEOVER.levels) {
    r -= level.weight;
    if (r <= 0) {
      const [lo, hi] = level.upgrades;
      const upgrades = lo + Math.floor(Math.random() * (hi - lo + 1));
      return { name: level.name, upgrades, jokers: level.jokers, multiplierBoost: level.multiplierBoost || 0 };
    }
  }
  return null;
}

/*
  Resolves one full spin (all cascades) synchronously.

  options:
    bonusMode, startingCascadeMultiplier (persists across bonus spins),
    startingHeat, jokerRateMultiplier, redBlueBoost (bonus-mode odds
    boosts), deathRideLevel (informational, engine doesn't need it but
    passes back the level reached for the UI).

  Returns steps[] the UI animates through, plus final totals.
*/
function resolveSpin(cols, rows, settings, betAmount, options) {
  options = options || {};
  const bonusMode = !!options.bonusMode;
  const heatCfg = bonusMode ? HEAT.bonus : HEAT.base;
  const cascadeCap = bonusMode ? CASCADE.bonusCap : CASCADE.baseCap;
  const minSize = Math.max(CLUSTER_MIN_FLOOR, settings.clusterMin || CLUSTER_MIN_FLOOR);

  const genOpts = {
    jokerRateMultiplier: options.jokerRateMultiplier || 1,
    redBlueBoost: options.redBlueBoost || 1,
  };

  let grid = generateGrid(cols, rows, settings, genOpts);

  // Jester Takeover happens on the drop, before clusters are evaluated,
  // per the brief ("The spin then evaluates normally" afterward).
  let takeover = null;
  if (bonusMode && options.allowJesterTakeover) {
    takeover = rollJesterTakeover();
    if (takeover) {
      const jokerTier = takeover.jokers >= 2 ? "red" : "plain";
      applyUpgrades(grid, cols, rows, takeover.upgrades, Math.floor(takeover.upgrades / 3), takeover.jokers, jokerTier);
    }
  }

  const totalCells = cols * rows;
  let cascadeMultiplier = options.startingCascadeMultiplier || 1;
  let heat = options.startingHeat || 0;
  let overdriveActive = false;
  let guaranteedJokerPending = false;

  const bonusCountInitial = countBonusSymbols(grid, cols, rows);

  const steps = [{ grid: grid.map((row) => row.slice()), clusters: [], awards: [] }];
  let totalWin = 0;
  let cascadeCount = 0;
  let biggestCluster = 0;
  let extraSpinsEarned = 0;
  let fullGridInferno = false;
  let anyBlueJesterDeathRide = false;
  let anyChainReaction = false;
  let overdriveTriggeredThisSpin = false;

  while (true) {
    const clusters = findClusters(grid, cols, rows, minSize);
    if (clusters.length === 0) break;

    cascadeCount++;
    if (cascadeCount > 1) cascadeMultiplier = Math.min(cascadeCap, cascadeMultiplier + 1);

    if (guaranteedJokerPending && OVERDRIVE.guaranteedJokerNextCascade) {
      const emptyish = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] && grid[r][c].kind === "symbol") emptyish.push([r, c]);
      if (emptyish.length) {
        const [jr, jc] = emptyish[Math.floor(Math.random() * emptyish.length)];
        grid[jr][jc] = { kind: "joker", tier: "blue" };
      }
      guaranteedJokerPending = false;
    }

    const removedCells = new Set();
    const awards = [];
    let stepWin = 0;

    clusters.forEach((cluster) => {
      const result = computeClusterAward(cluster, grid, betAmount, cascadeMultiplier);
      awards.push(result);
      stepWin += result.award;
      biggestCluster = Math.max(biggestCluster, result.size);
      if (result.chainReaction) anyChainReaction = true;
      if (result.blueJesterDeathRide) anyBlueJesterDeathRide = true;
      cluster.cells.forEach(([r, c]) => removedCells.add(r + "," + c));

      if (bonusMode) {
        extraSpinsEarned += extraSpinsForCluster(result.size);
      }

      result.cells.forEach(([r, c]) => {
        const cell = grid[r][c];
        if (cell.kind === "symbol") heat += cell.color === "blue" ? heatCfg.blueWin : cell.color === "red" ? heatCfg.redWin : heatCfg.plainWin;
        else if (cell.kind === "joker") heat += cell.tier === "blue" ? heatCfg.blueJoker : cell.tier === "red" ? heatCfg.redJoker : heatCfg.plainJoker;
      });
    });
    if (cascadeCount > 1) heat += heatCfg.perExtraCascade;

    totalWin += stepWin;

    if (!overdriveActive && heat >= heatCfg.threshold) {
      overdriveActive = true;
      overdriveTriggeredThisSpin = true;
      cascadeMultiplier = Math.min(cascadeCap, cascadeMultiplier + OVERDRIVE.cascadeMultiplierBoost);
      applyUpgrades(grid, cols, rows, OVERDRIVE.plainToRedUpgrades, OVERDRIVE.redToBlueUpgrades, 0);
      guaranteedJokerPending = true;
    }

    if (bonusMode && removedCells.size / totalCells >= FULL_GRID_INFERNO.minClearFraction) {
      fullGridInferno = true;
      cascadeMultiplier = Math.min(cascadeCap, cascadeMultiplier + CASCADE.fullGridBonusBoost);
      extraSpinsEarned += FULL_GRID_INFERNO.extraSpins;
    }

    removedCells.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      grid[r][c] = null;
    });
    applyGravity(grid, cols, rows);
    fillEmpty(grid, cols, rows, settings, genOpts);

    steps.push({
      grid: grid.map((row) => row.slice()),
      clusters: clusters.map((cl, i) => ({ cells: cl.cells, familyId: cl.familyId })),
      awards,
      stepWin,
      cascadeMultiplier,
      heat,
      overdriveJustTriggered: overdriveActive && cascadeCount === (overdriveTriggeredThisSpin ? cascadeCount : -1),
    });

    if (cascadeCount > 40) break; // safety valve
  }

  const bonusSymbolSpinsAwarded = bonusMode ? bonusRetriggerSpins(bonusCountInitial) : bonusTriggerSpins(bonusCountInitial);

  return {
    steps,
    totalWin,
    cascadeCount,
    biggestCluster,
    bonusCountInitial,
    bonusSymbolSpinsAwarded,
    extraSpinsEarned,
    endingCascadeMultiplier: cascadeMultiplier,
    endingHeat: heat,
    overdriveTriggeredThisSpin,
    fullGridInferno,
    anyChainReaction,
    anyBlueJesterDeathRide,
    takeover,
    deathRideLevel: bonusMode ? deathRideLevelFor(cascadeMultiplier) : null,
  };
}
