function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.symbol;
  }
  return pool[pool.length - 1].symbol;
}

function buildPool(settings, favoredIds) {
  const jesterWeight = Math.max(0.2, (settings.jesterRate / 100) * 8);
  const clusterBoost = 1 + (settings.winProbability / 100) * 2.5;

  return SYMBOL_SET.map((s) => {
    let weight = s.isWild ? jesterWeight : s.weight;
    if (!s.isWild && favoredIds.includes(s.id)) {
      weight *= clusterBoost;
    }
    return { symbol: s, weight };
  });
}

function pickFavoredSet() {
  const nonWild = SYMBOL_SET.filter((s) => !s.isWild);
  const shuffled = nonWild.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2).map((s) => s.id);
}

function generateGrid(cols, rows, settings) {
  const favored = pickFavoredSet();
  const pool = buildPool(settings, favored);
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

function fillEmpty(grid, cols, rows, settings) {
  const favored = pickFavoredSet();
  const pool = buildPool(settings, favored);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] === null) {
        grid[r][c] = weightedPick(pool).id;
      }
    }
  }
}

function symbolById(id) {
  return SYMBOL_SET.find((s) => s.id === id);
}

function findClusters(grid, cols, rows, minSize) {
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const clusters = [];
  const nonWildIds = SYMBOL_SET.filter((s) => !s.isWild).map((s) => s.id);

  function neighbors(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(
      ([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols
    );
  }

  for (const targetId of nonWildIds) {
    const localVisited = Array.from({ length: rows }, () => Array(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (localVisited[r][c]) continue;
        const cellId = grid[r][c];
        if (cellId !== targetId && !(symbolById(cellId) || {}).isWild) continue;
        if (cellId !== targetId) continue;

        const stack = [[r, c]];
        const cells = [];
        let hasNonWild = false;
        localVisited[r][c] = true;

        while (stack.length) {
          const [cr, cc] = stack.pop();
          cells.push([cr, cc]);
          const cid = grid[cr][cc];
          if (cid === targetId) hasNonWild = true;

          for (const [nr, nc] of neighbors(cr, cc)) {
            if (localVisited[nr][nc]) continue;
            const nid = grid[nr][nc];
            const nSym = symbolById(nid);
            if (nid === targetId || (nSym && nSym.isWild)) {
              localVisited[nr][nc] = true;
              stack.push([nr, nc]);
            }
          }
        }

        if (hasNonWild && cells.length >= minSize) {
          clusters.push({ symbolId: targetId, tier: symbolById(targetId).tier, cells });
        }
      }
    }
  }

  return clusters;
}

function applyGravity(grid, cols, rows) {
  for (let c = 0; c < cols; c++) {
    const colVals = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (grid[r][c] !== null) colVals.push(grid[r][c]);
    }
    for (let r = rows - 1; r >= 0; r--) {
      const idx = rows - 1 - r;
      grid[r][c] = idx < colVals.length ? colVals[idx] : null;
    }
  }
}

function countJesters(grid, cols, rows) {
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((symbolById(grid[r][c]) || {}).isWild) count++;
    }
  }
  return count;
}

/*
  Resolves one full spin (all cascades) synchronously and returns a list of
  "steps" for the UI to animate through:
    steps[0] = { grid } initial drop
    steps[n] = { clusters, removedCells, grid } each cascade result
  totalWin is in bet multiples (multiply by bet + multiplier by caller).
*/
function resolveSpin(cols, rows, settings, options) {
  options = options || {};
  const flatMultiplier = options.flatMultiplier || 1;
  const bonusMode = !!options.bonusMode;
  const startingCascadeCount = options.startingCascadeCount || 0;

  const minSize = settings.clusterMin || 5;
  let grid = generateGrid(cols, rows, settings);
  const initialJesterCount = countJesters(grid, cols, rows);

  const steps = [{ grid: grid.map((row) => row.slice()), clusters: [] }];
  let totalMultiplierUnits = 0;
  let cascadeCount = 0;
  let biggestCluster = 0;
  let highestMultiplierUsed = 1;

  while (true) {
    const clusters = findClusters(grid, cols, rows, minSize);
    if (clusters.length === 0) break;

    cascadeCount++;
    const jesterCount = countJesters(grid, cols, rows);
    const jesterMult = jesterWildMultiplier(jesterCount);
    const activeMultiplier = bonusMode
      ? cascadeMultiplier(startingCascadeCount + cascadeCount)
      : flatMultiplier;
    highestMultiplierUsed = Math.max(highestMultiplierUsed, activeMultiplier);

    const removedCells = new Set();
    for (const cluster of clusters) {
      biggestCluster = Math.max(biggestCluster, cluster.cells.length);
      const payMult = payoutMultiplierForCluster(cluster.tier, cluster.cells.length);
      totalMultiplierUnits += payMult * jesterMult * activeMultiplier;
      cluster.cells.forEach(([r, c]) => removedCells.add(r + "," + c));
    }

    removedCells.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      grid[r][c] = null;
    });

    applyGravity(grid, cols, rows);
    fillEmpty(grid, cols, rows, settings);

    steps.push({
      grid: grid.map((row) => row.slice()),
      clusters,
      removedCells: Array.from(removedCells),
    });

    if (cascadeCount > 15) break; // safety valve — stop runaway snowballing in one spin
  }

  return {
    steps,
    totalMultiplierUnits,
    cascadeCount,
    biggestCluster,
    initialJesterCount,
    endingCascadeCount: startingCascadeCount + cascadeCount,
    highestMultiplierUsed,
  };
}
