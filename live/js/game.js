(async () => {
const session = await drRequireSessionOrRedirect("signin.html");
let player = session ? await drCurrentPlayer() : null;

if (player) {
  const cols = () => GRID_COLS;
  const rows = () => GRID_ROWS;
  const BONUS_COLS = 8;
  const BONUS_ROWS = 10;

  // Tiles are sized a bit larger than their exact grid slot (still
  // centered on it) so symbols read bigger without changing the reel
  // window's bounds or the spin geometry math.
  const TILE_SIZE_BOOST = 1.14;

  const MIN_BET = 0.1;
  const MAX_BET = 100;
  const BET_STEP = 0.1;
  let bet = 1;
  let isSpinning = false;

  function roundBet(v) { return Math.round(v * 10) / 10; }
  function formatCredits(v) { return (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  const reelWindow = document.getElementById("reelWindow");
  const hudBet = document.getElementById("hudBet");
  const hudCredits = document.getElementById("hudCredits");
  const hudWin = document.getElementById("hudWin");
  const creditsTop = document.getElementById("creditsTop");
  const betVal = document.getElementById("betVal");
  const winFlashLayer = document.getElementById("winFlashLayer");

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function showWinFlash(text, kind) {
    const el = document.createElement("div");
    el.className = "win-flash-text " + (kind || "cascade");
    el.textContent = text;
    el.addEventListener("animationend", () => el.remove());
    winFlashLayer.appendChild(el);
  }

  function refreshHud() {
    hudBet.textContent = bet.toFixed(1);
    hudCredits.textContent = formatCredits(player.credits);
    creditsTop.textContent = formatCredits(player.credits) + " cr";
    if (betVal) betVal.textContent = bet.toFixed(1);
  }

  function makeTile(symId, extraClass) {
    const sym = symbolById(symId);
    const tile = document.createElement("div");
    tile.className = "tile" + (extraClass ? " " + extraClass : "");
    if (sym) tile.style.backgroundImage = `url('${pickSymbolImage(sym)}')`;
    return tile;
  }

  function setupGridContainer(container) {
    container.style.display = "flex";
    container.style.flexDirection = "row";
  }

  function renderGrid(container, grid, c, r, fallingCells) {
    setupGridContainer(container);
    container.innerHTML = "";

    for (let ci = 0; ci < c; ci++) {
      const col = document.createElement("div");
      col.className = "reel-col";

      const strip = document.createElement("div");
      strip.className = "reel-strip";

      if (fallingCells) {
        // Natural size, plain top-to-bottom flow — no boost while
        // animating (see the settled branch below for why).
        for (let ri = 0; ri < r; ri++) {
          const tile = makeTile(grid[ri][ci], "falling");
          tile.style.flex = "0 0 " + (100 / r) + "%";
          tile.dataset.r = ri;
          tile.dataset.c = ci;
          strip.appendChild(tile);
        }
      } else {
        // Settled grid: boosted size, absolutely positioned and
        // centered on each row's true slot. A fixed, predictable 2D
        // overlap (not a 3D projection), so it renders identically
        // everywhere — unlike the old cylinder version, oversizing here
        // is completely safe since nothing is rotating.
        const trueSlot = 100 / r;
        const boosted = trueSlot * TILE_SIZE_BOOST;
        const offset = (boosted - trueSlot) / 2;
        for (let ri = 0; ri < r; ri++) {
          const tile = makeTile(grid[ri][ci], null);
          tile.style.position = "absolute";
          tile.style.left = "0";
          tile.style.right = "0";
          tile.style.top = `calc(${ri * trueSlot}% - ${offset}%)`;
          tile.style.height = boosted + "%";
          tile.dataset.r = ri;
          tile.dataset.c = ci;
          strip.appendChild(tile);
        }
      }

      col.appendChild(strip);
      container.appendChild(col);
    }
  }

  // Three beats per cluster win: (1) every matched tile lights up electric
  // blue immediately, (2) ~140ms later the cluster's OUTER perimeter (not
  // the seams between matched tiles) flashes white-hot, (3) ~260ms in,
  // everything blows up. Takes `clusters` (one entry per matched group,
  // each with its own cell list) rather than a flat cell list so the
  // outline can tell which edges are the group's actual outer boundary.
  function highlightCells(container, clusters) {
    const containerRect = container.getBoundingClientRect();
    const allCells = [];

    // Every tile has a permanent blue neon border, so the win glow alone
    // used to blend right into the board. Dimming everything else for
    // the duration of the sequence makes the winning cluster actually
    // pop instead of reading as "the same board, slightly brighter."
    container.classList.add("win-focus");

    const getTileRect = (r, c) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      return tile ? { tile, rect: tile.getBoundingClientRect() } : null;
    };

    clusters.forEach((cluster) => {
      const cellSet = new Set(cluster.cells.map(([r, c]) => r + "," + c));
      cluster.cells.forEach(([r, c]) => allCells.push([r, c]));

      // Beat 1: per-tile electric glow, right away.
      cluster.cells.forEach(([r, c]) => {
        const found = getTileRect(r, c);
        if (found) found.tile.classList.add("winning");
      });

      // Beat 2: white-hot outline along the cluster's outer edges only —
      // an edge only gets drawn where the neighbor isn't part of this
      // same cluster (or is off the grid), so tiles touching each other
      // inside the group stay seamless.
      setTimeout(() => {
        const NEIGHBORS = [["up", -1, 0], ["down", 1, 0], ["left", 0, -1], ["right", 0, 1]];
        cluster.cells.forEach(([r, c]) => {
          const found = getTileRect(r, c);
          if (!found) return;
          const { rect: tileRect } = found;
          const left = tileRect.left - containerRect.left;
          const top = tileRect.top - containerRect.top;

          NEIGHBORS.forEach(([dir, dr, dc]) => {
            if (cellSet.has((r + dr) + "," + (c + dc))) return;
            const bar = document.createElement("div");
            bar.className = "cluster-edge cluster-edge-" + dir;
            if (dir === "up" || dir === "down") {
              bar.style.left = left + "px";
              bar.style.width = tileRect.width + "px";
              bar.style.top = (dir === "up" ? top : top + tileRect.height) + "px";
            } else {
              bar.style.top = top + "px";
              bar.style.height = tileRect.height + "px";
              bar.style.left = (dir === "left" ? left : left + tileRect.width) + "px";
            }
            container.appendChild(bar);
            bar.addEventListener("animationend", () => bar.remove());
          });
        });
      }, 150);
    });

    // Beat 3: the explosion — staged after the outline flash so it reads
    // as a sequence (glow -> outline -> boom), not everything at once.
    setTimeout(() => {
      allCells.forEach(([r, c]) => {
        const found = getTileRect(r, c);
        if (!found) return;
        const { rect: tileRect } = found;
        const cx = tileRect.left - containerRect.left + tileRect.width / 2;
        const cy = tileRect.top - containerRect.top + tileRect.height / 2;

        const boom = document.createElement("div");
        boom.className = "explosion";
        boom.style.left = cx + "px";
        boom.style.top = cy + "px";
        boom.style.width = (tileRect.width * 1.9) + "px";
        boom.style.height = (tileRect.height * 1.9) + "px";
        container.appendChild(boom);
        boom.addEventListener("animationend", () => boom.remove());

        const sparkCount = 9;
        for (let i = 0; i < sparkCount; i++) {
          const angle = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.6;
          const dist = 18 + Math.random() * 22;
          const spark = document.createElement("div");
          spark.className = "spark";
          spark.style.left = cx + "px";
          spark.style.top = cy + "px";
          spark.style.setProperty("--dx", Math.cos(angle) * dist + "px");
          spark.style.setProperty("--dy", Math.sin(angle) * dist + "px");
          container.appendChild(spark);
          spark.addEventListener("animationend", () => spark.remove());
        }
      });

      // container is the reel-window (main or bonus) itself.
      container.classList.remove("shaking");
      // Force reflow so re-adding the class restarts the animation on
      // back-to-back cascades instead of a no-op if it's already there.
      void container.offsetWidth;
      container.classList.add("shaking");
    }, 300);

    // Lift the dim once the explosion has had time to fully play out.
    setTimeout(() => {
      container.classList.remove("win-focus");
    }, 850);
  }

  // Standard cubic-bezier timing-function evaluator (bisection on the
  // x-curve to find t for a given elapsed-time fraction, then reads the
  // y-curve) — lets the JS-driven spin reuse the exact same easing feel
  // a CSS transition would have given the old translateY-based reels.
  function cubicBezierEase(x1, y1, x2, y2) {
    function bez(t, a, b) {
      const it = 1 - t;
      return 3 * it * it * t * a + 3 * it * t * t * b + t * t * t;
    }
    return function (t) {
      let lo = 0, hi = 1, u = t;
      for (let i = 0; i < 20; i++) {
        const x = bez(u, x1, x2);
        if (Math.abs(x - t) < 1e-4) break;
        if (x < t) lo = u; else hi = u;
        u = (lo + hi) / 2;
      }
      return bez(u, y1, y2);
    };
  }
  // y2 used to be 1.12 (an overshoot past the resting angle that eased
  // back) for a bouncy stop feel. Blur clears 260ms before the animation
  // actually finishes, so that overshoot-then-settle wobble was visible
  // unblurred right at the end — with the grid's now-coarser per-row
  // angle (6 rows vs the old 8), it read as two symbols overlapping in
  // one square until it snapped to rest. No overshoot now.
  const spinEase = cubicBezierEase(0.16, 0.85, 0.3, 1.0);

  /*
    Reel spin: each column mounts a tall strip of filler symbols
    followed by the real final column values, then scrolls the whole
    strip upward (plain translateY, no 3D) until the final rows sit in
    the window. Staggered left to right so columns stop one after
    another, with a brightness bump while moving fast to read as speed.
  */
  function spinReveal(container, c, r, finalGrid) {
    return new Promise((resolve) => {
      const extraRows = 34;
      const stripLen = extraRows + r;

      setupGridContainer(container);
      container.innerHTML = "";

      DrAudio.reelStart();

      const rowHeightPx = container.clientHeight / r;
      const targetY = -(extraRows * rowHeightPx);

      const perColDelay = 280;
      const baseDuration = 2500;
      let remaining = c;

      for (let ci = 0; ci < c; ci++) {
        const col = document.createElement("div");
        col.className = "reel-col";

        const strip = document.createElement("div");
        strip.className = "reel-strip";
        strip.style.transform = "translateY(0px)";

        for (let si = 0; si < stripLen; si++) {
          const isFinal = si >= extraRows;
          const ri = si - extraRows;
          const symId = isFinal
            ? finalGrid[ri][ci]
            : SYMBOL_SET[Math.floor(Math.random() * SYMBOL_SET.length)].id;
          const tile = makeTile(symId, null);
          tile.style.flex = "0 0 " + rowHeightPx + "px";
          strip.appendChild(tile);
        }

        col.appendChild(strip);
        container.appendChild(col);

        const delay = ci * perColDelay;
        const isLastCol = ci === c - 1;

        setTimeout(() => {
          // Only marked "spinning" (and brightened) once this column's
          // own scroll actually starts — it used to be set for every
          // column immediately at spin-start, so later columns sat
          // there visibly changed while still motionless, waiting out
          // their stagger delay.
          col.classList.add("spinning");
          const t0 = performance.now();
          function frame(now) {
            const t = Math.min(1, (now - t0) / baseDuration);
            const eased = spinEase(t);
            const y = targetY * eased;
            strip.style.transform = `translateY(${y.toFixed(2)}px)`;
            if (t < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }, 20 + delay);

        setTimeout(() => {
          col.classList.remove("spinning");
          DrAudio.reelStop(isLastCol);
        }, delay + baseDuration - 260);

        setTimeout(() => {
          // Bounce right as this column's own scroll actually stops —
          // staggered per column, same as the sound/blur already are.
          col.classList.add("landed");
        }, delay + baseDuration);

        setTimeout(() => {
          remaining--;
          if (remaining === 0) {
            renderGrid(container, finalGrid, c, r, false);
            DrAudio.symbolsLanded(finalGrid.flat());
            resolve();
          }
        }, delay + baseDuration + 100);
      }
    });
  }

  async function playCascadeFrom(container, c, r, result, bet) {
    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      highlightCells(container, step.clusters);
      DrAudio.winHit(step.removedCells.length, i - 1);
      const stepWin = roundBet((step.stepMultiplierUnits || 0) * bet);
      if (stepWin > 0) showWinFlash("+" + stepWin.toFixed(1) + " CREDITS", "cascade");
      await sleep(480);
      renderGrid(container, step.grid, c, r, true);
      DrAudio.cascadeSlam(i - 1);
      await sleep(300);
    }
  }

  function settleStats(betAmount, winAmount) {
    player.credits += winAmount - betAmount;
    player.creditsPlayed = (player.creditsPlayed || 0) + betAmount;
    player.creditsWon = (player.creditsWon || 0) + winAmount;
    player.creditsLost = (player.creditsLost || 0) + Math.max(0, betAmount - winAmount);
    drUpsertPlayer(player).catch(console.error);
  }

  async function maybeInstantJackpot(settings) {
    if (Math.random() * 100 < (settings.jackpotChance || 0)) {
      player.credits += 2500;
      player.creditsWon = (player.creditsWon || 0) + 2500;
      drUpsertPlayer(player).catch(console.error);
      refreshHud();
      DrAudio.jackpot();
      showWinFlash("MEGA JACKPOT! +2500", "jackpot");
      await sleep(2600);
      return true;
    }
    return false;
  }

  async function runBonus(freeSpinsAwarded, jesterCountInitial, lockedBet) {
    document.getElementById("jesterCountText").textContent = jesterCountInitial;
    document.getElementById("freeSpinsAwarded").textContent = freeSpinsAwarded;
    document.getElementById("bonusAnnounce").classList.add("show");
    DrAudio.bonusTrigger();
    await sleep(2200);
    document.getElementById("bonusAnnounce").classList.remove("show");

    const bonusPlayEl = document.getElementById("bonusPlay");
    const bonusReelWindow = document.getElementById("bonusReelWindow");
    bonusPlayEl.classList.add("show");

    let spinsLeft = freeSpinsAwarded;
    let runningCascadeCount = 0;
    let bonusWinTotal = 0;
    let highestMult = 1;
    let biggestCascadeOverall = 0;
    let jackpotHit = false;

    while (spinsLeft > 0) {
      spinsLeft--;
      document.getElementById("bonusSpinsLeft").textContent = spinsLeft;

      const settings = await drGetEffectiveSettings(player);
      const result = resolveSpin(BONUS_COLS, BONUS_ROWS, settings, {
        bonusMode: true,
        startingCascadeCount: runningCascadeCount,
      });

      await spinReveal(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result.steps[0].grid);
      await sleep(200);
      await playCascadeFrom(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result, lockedBet);

      const spinWin = roundBet(result.totalMultiplierUnits * lockedBet);
      bonusWinTotal += spinWin;
      runningCascadeCount = result.endingCascadeCount;
      if (result.highestMultiplierUsed > highestMult) {
        highestMult = result.highestMultiplierUsed;
        showWinFlash(highestMult + "X MULTIPLIER!", "bonus");
        DrAudio.multiplierHit(highestMult);
      }
      biggestCascadeOverall = Math.max(biggestCascadeOverall, result.biggestCluster);

      const wasJackpot = jackpotHit;
      if (result.initialJesterCount >= 40) jackpotHit = true;
      if (runningCascadeCount >= 100) jackpotHit = true;
      if (Math.random() * 100 < (settings.jackpotChance || 0)) jackpotHit = true;
      if (jackpotHit && !wasJackpot) {
        DrAudio.jackpot();
        showWinFlash("JACKPOT +2500!", "jackpot");
        await sleep(2600);
      }

      document.getElementById("bonusMultiplier").textContent = highestMult + "x";
      document.getElementById("bonusWinTotal").textContent = formatCredits(bonusWinTotal);

      await sleep(350);
    }

    if (jackpotHit) bonusWinTotal += 2500;

    player.credits += bonusWinTotal;
    player.creditsWon = (player.creditsWon || 0) + bonusWinTotal;
    drUpsertPlayer(player).catch(console.error);
    refreshHud();

    bonusPlayEl.classList.remove("show");

    document.getElementById("endTotalWin").textContent = formatCredits(bonusWinTotal);
    document.getElementById("endBiggestCascade").textContent = biggestCascadeOverall;
    document.getElementById("endHighestMult").textContent = highestMult + "x";
    document.getElementById("endJackpotStatus").textContent = jackpotHit ? "WIN — 2500 CREDITS" : "NO WIN";
    document.getElementById("bonusEnd").classList.add("show");
  }

  function closeBonusEnd() {
    document.getElementById("bonusEnd").classList.remove("show");
  }

  async function playSpin() {
    if (isSpinning) return;
    // The Spin button sits in a higher stacking layer than the bonus
    // overlays, so it stays clickable even while "BONUS COMPLETE" (or the
    // trigger/free-spins screens) are still up. Spinning through them used
    // to bury the next win's glow/outline animation underneath the still-
    // open modal, invisible until the player dismissed it.
    if (document.querySelector(".bonus-overlay.show")) return;
    if (player.credits < bet) {
      alert("Not enough credits.");
      return;
    }

    isSpinning = true;
    document.getElementById("btnSpinFloat").classList.add("disabled");

    const settings = await drGetEffectiveSettings(player);
    const c = cols();
    const r = rows();

    const result = resolveSpin(c, r, settings, { flatMultiplier: 1, bonusMode: false });

    await spinReveal(reelWindow, c, r, result.steps[0].grid);
    await sleep(200);
    await playCascadeFrom(reelWindow, c, r, result, bet);

    const winAmount = roundBet(result.totalMultiplierUnits * bet);
    settleStats(bet, winAmount);
    const prevWin = parseFloat(document.getElementById("hudWin").textContent) || 0;
    DrAudio.animateCountUp(document.getElementById("hudWin"), prevWin, winAmount, 700, "win_count");
    refreshHud();

    await maybeInstantJackpot(settings);

    const freeSpinsAwarded = freeSpinsForJesterCount(result.initialJesterCount);
    if (freeSpinsAwarded > 0) {
      await runBonus(freeSpinsAwarded, result.initialJesterCount, bet);
    }

    isSpinning = false;
    document.getElementById("btnSpinFloat").classList.remove("disabled");
  }

  document.querySelectorAll(".ctrl-btn, .stepper-btn").forEach((btn) => {
    btn.addEventListener("mouseenter", () => DrAudio.hoverSound());
  });

  document.getElementById("btnSpinFloat").addEventListener("click", () => {
    DrAudio.start();
    DrAudio.enterScene("game");
    DrAudio.spinButtonPress();
    playSpin();
  });

  const muteBtn = document.getElementById("btnMute");
  muteBtn.addEventListener("click", () => {
    DrAudio.start();
    DrAudio.enterScene("game");
    DrAudio.clickSound();
    const next = !DrAudio.isMuted();
    DrAudio.setMuted(next);
    muteBtn.textContent = next ? "🔇" : "🔊";
  });

  document.getElementById("btnMinBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    bet = MIN_BET;
    refreshHud();
  });

  document.getElementById("btnBetDownFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    bet = Math.max(MIN_BET, roundBet(bet - BET_STEP));
    refreshHud();
  });

  document.getElementById("btnBetUpFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    bet = Math.min(MAX_BET, roundBet(bet + BET_STEP));
    refreshHud();
  });

  document.getElementById("btnMaxBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    bet = MAX_BET;
    refreshHud();
  });

  document.getElementById("btnPlayAgain").addEventListener("click", closeBonusEnd);
  document.getElementById("btnReturnToGame").addEventListener("click", closeBonusEnd);

  setupGridContainer(reelWindow);
  refreshHud();

  if (player.role === "admin" && drIsPlayerViewActive()) {
    const returnLink = document.getElementById("returnToAdminLink");
    returnLink.style.display = "inline";
    returnLink.addEventListener("click", () => drExitPlayerView());
  }

  let lastTimeSave = Date.now();
  function saveTimePlaying() {
    const now = Date.now();
    const minutes = Math.round((now - lastTimeSave) / 60000);
    if (minutes > 0) {
      player.timePlayingMinutes = (player.timePlayingMinutes || 0) + minutes;
      drUpsertPlayer(player).catch(console.error);
      lastTimeSave = now;
    }
  }
  setInterval(saveTimePlaying, 20000);
  window.addEventListener("beforeunload", saveTimePlaying);
}
})();
