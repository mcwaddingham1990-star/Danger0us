const session = drRequireSessionOrRedirect("signin.html");
let player = session ? drCurrentPlayer() : null;

if (player) {
  const cols = () => GRID_COLS;
  const rows = () => GRID_ROWS;
  const BONUS_COLS = 8;
  const BONUS_ROWS = 10;

  const betLevels = [1, 2, 5, 10, 25, 50, 100];
  let betIndex = 2;
  let isSpinning = false;

  const reelWindow = document.getElementById("reelWindow");
  const hudBet = document.getElementById("hudBet");
  const hudCredits = document.getElementById("hudCredits");
  const hudWin = document.getElementById("hudWin");
  const creditsTop = document.getElementById("creditsTop");
  const multiplierBtnVal = document.getElementById("multiplierVal");
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
    hudBet.textContent = betLevels[betIndex];
    hudCredits.textContent = Math.round(player.credits).toLocaleString();
    creditsTop.textContent = Math.round(player.credits).toLocaleString() + " cr";
    if (multiplierBtnVal) multiplierBtnVal.textContent = "x" + betLevels[betIndex];
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
        if (sym) tile.style.backgroundImage = `url('${sym.img}')`;
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
      const boom = document.createElement("div");
      boom.className = "explosion";
      tile.appendChild(boom);
    });
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
      const extraRows = 22;
      const stripLen = extraRows + r;

      container.style.display = "flex";
      container.style.flexDirection = "row";
      container.style.gridTemplateColumns = "";
      container.style.gridTemplateRows = "";
      container.innerHTML = "";

      DrAudio.spinStart();

      const perColDelay = 220;
      const baseDuration = 1600;
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
          if (sym) tile.style.backgroundImage = `url('${sym.img}')`;
          strip.appendChild(tile);
        }

        col.appendChild(strip);
        container.appendChild(col);

        const travel = ((stripLen - r) / stripLen) * 100;
        const delay = ci * perColDelay;

        setTimeout(() => {
          strip.style.transition = `transform ${baseDuration}ms cubic-bezier(0.2, 0.85, 0.25, 1)`;
          strip.style.transform = `translateY(-${travel}%)`;
        }, 20 + delay);

        setTimeout(() => {
          strip.classList.remove("spinning");
          DrAudio.reelStop();
        }, delay + baseDuration - 150);

        setTimeout(() => {
          remaining--;
          if (remaining === 0) {
            renderGrid(container, finalGrid, c, r, false);
            resolve();
          }
        }, delay + baseDuration + 60);
      }
    });
  }

  async function playCascadeFrom(container, c, r, result, bet) {
    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      const cells = step.removedCells.map((k) => k.split(",").map(Number));
      highlightCells(container, cells);
      DrAudio.explosion();
      DrAudio.winChime(Math.min(3, i - 1));
      const stepWin = Math.round((step.stepMultiplierUnits || 0) * bet);
      if (stepWin > 0) showWinFlash("+" + stepWin.toLocaleString() + " CREDITS", "cascade");
      await sleep(480);
      renderGrid(container, step.grid, c, r, true);
      await sleep(300);
    }
  }

  function settleStats(betAmount, winAmount) {
    player.credits += winAmount - betAmount;
    player.creditsPlayed = (player.creditsPlayed || 0) + betAmount;
    player.creditsWon = (player.creditsWon || 0) + winAmount;
    player.creditsLost = (player.creditsLost || 0) + Math.max(0, betAmount - winAmount);
    drUpsertPlayer(player);
  }

  async function maybeInstantJackpot(settings) {
    if (Math.random() * 100 < (settings.jackpotChance || 0)) {
      player.credits += 2500;
      player.creditsWon = (player.creditsWon || 0) + 2500;
      drUpsertPlayer(player);
      refreshHud();
      DrAudio.jackpot();
      showWinFlash("MEGA JACKPOT! +2500", "jackpot");
      await sleep(1700);
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

      const settings = drGetSettings();
      const result = resolveSpin(BONUS_COLS, BONUS_ROWS, settings, {
        bonusMode: true,
        startingCascadeCount: runningCascadeCount,
      });

      await spinReveal(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result.steps[0].grid);
      await sleep(200);
      await playCascadeFrom(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result, lockedBet);

      const spinWin = Math.round(result.totalMultiplierUnits * lockedBet);
      bonusWinTotal += spinWin;
      runningCascadeCount = result.endingCascadeCount;
      if (result.highestMultiplierUsed > highestMult) {
        highestMult = result.highestMultiplierUsed;
        showWinFlash(highestMult + "X MULTIPLIER!", "bonus");
        DrAudio.winChime(3);
      }
      biggestCascadeOverall = Math.max(biggestCascadeOverall, result.biggestCluster);

      const wasJackpot = jackpotHit;
      if (result.initialJesterCount >= 40) jackpotHit = true;
      if (runningCascadeCount >= 100) jackpotHit = true;
      if (Math.random() * 100 < (settings.jackpotChance || 0)) jackpotHit = true;
      if (jackpotHit && !wasJackpot) {
        DrAudio.jackpot();
        showWinFlash("JACKPOT +2500!", "jackpot");
        await sleep(1700);
      }

      document.getElementById("bonusMultiplier").textContent = highestMult + "x";
      document.getElementById("bonusWinTotal").textContent = Math.round(bonusWinTotal).toLocaleString();

      await sleep(350);
    }

    if (jackpotHit) bonusWinTotal += 2500;

    player.credits += bonusWinTotal;
    player.creditsWon = (player.creditsWon || 0) + bonusWinTotal;
    drUpsertPlayer(player);
    refreshHud();

    bonusPlayEl.classList.remove("show");

    document.getElementById("endTotalWin").textContent = Math.round(bonusWinTotal).toLocaleString();
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
    const bet = betLevels[betIndex];
    if (player.credits < bet) {
      alert("Not enough credits.");
      return;
    }

    isSpinning = true;
    document.getElementById("btnSpinFloat").classList.add("disabled");

    const settings = drGetSettings();
    const c = cols();
    const r = rows();

    const result = resolveSpin(c, r, settings, { flatMultiplier: 1, bonusMode: false });

    await spinReveal(reelWindow, c, r, result.steps[0].grid);
    await sleep(200);
    await playCascadeFrom(reelWindow, c, r, result, bet);

    const winAmount = Math.round(result.totalMultiplierUnits * bet);
    settleStats(bet, winAmount);
    document.getElementById("hudWin").textContent = winAmount.toLocaleString();
    refreshHud();

    await maybeInstantJackpot(settings);

    const freeSpinsAwarded = freeSpinsForJesterCount(result.initialJesterCount);
    if (freeSpinsAwarded > 0) {
      await runBonus(freeSpinsAwarded, result.initialJesterCount, bet);
    }

    isSpinning = false;
    document.getElementById("btnSpinFloat").classList.remove("disabled");
  }

  document.getElementById("btnSpinFloat").addEventListener("click", () => {
    DrAudio.start();
    playSpin();
  });

  const muteBtn = document.getElementById("btnMute");
  muteBtn.addEventListener("click", () => {
    DrAudio.start();
    const next = !DrAudio.isMuted();
    DrAudio.setMuted(next);
    muteBtn.textContent = next ? "🔇" : "🔊";
  });

  document.getElementById("btnMinBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = 0;
    refreshHud();
  });

  document.getElementById("btnMultiplierFloat").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = (betIndex + 1) % betLevels.length;
    refreshHud();
  });

  document.getElementById("btnMaxBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = betLevels.length - 1;
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
      drUpsertPlayer(player);
      lastTimeSave = now;
    }
  }
  setInterval(saveTimePlaying, 20000);
  window.addEventListener("beforeunload", saveTimePlaying);
}
