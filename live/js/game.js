(async () => {
const session = await drRequireSessionOrRedirect("signin.html");
let player = session ? await drCurrentPlayer() : null;

if (player) {
  const cols = () => GRID_COLS;
  const rows = () => GRID_ROWS;
  const BONUS_COLS = 8;
  const BONUS_ROWS = 10;

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

  function setupGridContainer(container, c, r) {
    container.style.display = "grid";
    container.style.gridTemplateColumns = `repeat(${c}, 1fr)`;
    container.style.gridTemplateRows = `repeat(${r}, 1fr)`;
  }

  function renderGrid(container, grid, c, r, fallingCells) {
    setupGridContainer(container, c, r);
    container.innerHTML = "";
    for (let ri = 0; ri < r; ri++) {
      for (let ci = 0; ci < c; ci++) {
        const sym = symbolById(grid[ri][ci]);
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.r = ri;
        tile.dataset.c = ci;
        if (sym) tile.style.backgroundImage = `url('${pickSymbolImage(sym)}')`;
        if (fallingCells) tile.classList.add("falling");
        container.appendChild(tile);
      }
    }
  }

  function highlightCells(container, cells) {
    cells.forEach(([r, c]) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      if (!tile) return;
      tile.classList.add("winning");

      // Appended to the reel-window, not the tile — .tile has
      // overflow:hidden (for its background-image) which would clip a
      // burst/sparks meant to spill outside the tile's own bounds.
      const cx = tile.offsetLeft + tile.offsetWidth / 2;
      const cy = tile.offsetTop + tile.offsetHeight / 2;

      const boom = document.createElement("div");
      boom.className = "explosion";
      boom.style.left = cx + "px";
      boom.style.top = cy + "px";
      boom.style.width = (tile.offsetWidth * 1.7) + "px";
      boom.style.height = (tile.offsetHeight * 1.7) + "px";
      container.appendChild(boom);
      boom.addEventListener("animationend", () => boom.remove());

      const sparkCount = 6;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (i / sparkCount) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 14 + Math.random() * 16;
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
  }

  /*
    Realistic reel spin: each column is its own scrollable strip of filler
    symbols followed by the real final column values. The strip animates
    from "showing filler" to "showing the final rows", staggered left to
    right so columns stop one after another, with a motion-blur while
    moving fast that clears just before it settles.
  */
  function spinReveal(container, c, r, finalGrid) {
    return new Promise((resolve) => {
      const extraRows = 34;
      const stripLen = extraRows + r;

      container.style.display = "flex";
      container.style.flexDirection = "row";
      container.style.gridTemplateColumns = "";
      container.style.gridTemplateRows = "";
      container.innerHTML = "";

      DrAudio.reelStart();

      const perColDelay = 280;
      const baseDuration = 2500;
      let remaining = c;

      for (let ci = 0; ci < c; ci++) {
        const col = document.createElement("div");
        col.className = "reel-col";
        col.style.width = (100 / c) + "%";

        const strip = document.createElement("div");
        strip.className = "reel-strip spinning";
        strip.style.height = (stripLen / r * 100) + "%";

        for (let si = 0; si < stripLen; si++) {
          const isFinal = si >= extraRows;
          const ri = si - extraRows;
          const symId = isFinal
            ? finalGrid[ri][ci]
            : SYMBOL_SET[Math.floor(Math.random() * SYMBOL_SET.length)].id;
          const sym = symbolById(symId);
          const tile = document.createElement("div");
          tile.className = "tile reel-strip-tile";
          if (sym) tile.style.backgroundImage = `url('${pickSymbolImage(sym)}')`;
          strip.appendChild(tile);
        }

        col.appendChild(strip);
        container.appendChild(col);

        const travel = ((stripLen - r) / stripLen) * 100;
        const delay = ci * perColDelay;

        setTimeout(() => {
          strip.style.transition = `transform ${baseDuration}ms cubic-bezier(0.16, 0.85, 0.3, 1.12)`;
          strip.style.transform = `translateY(-${travel}%)`;
        }, 20 + delay);

        const isLastCol = ci === c - 1;
        setTimeout(() => {
          strip.classList.remove("spinning");
          DrAudio.reelStop(isLastCol);
        }, delay + baseDuration - 260);

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
      const cells = step.removedCells.map((k) => k.split(",").map(Number));
      highlightCells(container, cells);
      DrAudio.winHit(cells.length);
      const stepWin = roundBet((step.stepMultiplierUnits || 0) * bet);
      if (stepWin > 0) showWinFlash("+" + stepWin.toFixed(1) + " CREDITS", "cascade");
      await sleep(480);
      renderGrid(container, step.grid, c, r, true);
      DrAudio.cascadeSlam();
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
    DrAudio.enterScene("bonus");
    DrAudio.maybeVoiceLine(0.3);
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
    DrAudio.enterScene("game");

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
    DrAudio.maybeVoiceLine(0.1);
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

  setupGridContainer(reelWindow, cols(), rows());
  refreshHud();

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
