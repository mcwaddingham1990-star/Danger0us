const session = drRequireSessionOrRedirect("signin.html");
let player = session ? drCurrentPlayer() : null;

if (player) {
  const cols = () => (drGetSettings().columns || 10);
  const rows = () => (drGetSettings().rows || 10);
  const BONUS_COLS = 8;
  const BONUS_ROWS = 10;

  const betLevels = [1, 2, 5, 10, 25, 50, 100];
  let betIndex = 2;
  let isSpinning = false;
  let fastSpin = false;
  let autoPlay = false;
  let autoSpinsLeft = 0;

  const reelWindow = document.getElementById("reelWindow");
  const hudBet = document.getElementById("hudBet");
  const hudCredits = document.getElementById("hudCredits");
  const hudWin = document.getElementById("hudWin");
  const creditsTop = document.getElementById("creditsTop");

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }
  function speed(ms) { return fastSpin ? ms * 0.4 : ms; }

  function refreshHud() {
    hudBet.textContent = betLevels[betIndex];
    hudCredits.textContent = Math.round(player.credits).toLocaleString();
    creditsTop.textContent = Math.round(player.credits).toLocaleString() + " cr";
  }

  function setupGridContainer(container, c, r) {
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

  async function shuffleFlash(container, c, r, durationMs) {
    const frames = Math.max(2, Math.round(durationMs / 90));
    for (let f = 0; f < frames; f++) {
      const fakeGrid = [];
      for (let ri = 0; ri < r; ri++) {
        const row = [];
        for (let ci = 0; ci < c; ci++) row.push(SYMBOL_SET[Math.floor(Math.random() * SYMBOL_SET.length)].id);
        fakeGrid.push(row);
      }
      renderGrid(container, fakeGrid, c, r, false);
      await sleep(90);
    }
  }

  async function playCascadeSequence(container, c, r, result) {
    renderGrid(container, result.steps[0].grid, c, r, false);
    await sleep(speed(260));

    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      const cells = step.removedCells.map((k) => k.split(",").map(Number));
      highlightCells(container, cells);
      await sleep(speed(480));
      renderGrid(container, step.grid, c, r, true);
      await sleep(speed(300));
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
      alert("MEGA JACKPOT! +2500 credits");
      return true;
    }
    return false;
  }

  async function runBonus(freeSpinsAwarded, jesterCountInitial, lockedBet) {
    document.getElementById("jesterCountText").textContent = jesterCountInitial;
    document.getElementById("freeSpinsAwarded").textContent = freeSpinsAwarded;
    document.getElementById("bonusAnnounce").classList.add("show");
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

      await playCascadeSequence(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result);

      const spinWin = Math.round(result.totalMultiplierUnits * lockedBet);
      bonusWinTotal += spinWin;
      runningCascadeCount = result.endingCascadeCount;
      highestMult = Math.max(highestMult, result.highestMultiplierUsed);
      biggestCascadeOverall = Math.max(biggestCascadeOverall, result.biggestCluster);

      if (result.initialJesterCount >= 40) jackpotHit = true;
      if (runningCascadeCount >= 100) jackpotHit = true;
      if (Math.random() * 100 < (settings.jackpotChance || 0)) jackpotHit = true;

      document.getElementById("bonusMultiplier").textContent = highestMult + "x";
      document.getElementById("bonusWinTotal").textContent = Math.round(bonusWinTotal).toLocaleString();

      await sleep(speed(350));
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
    const settings = drGetSettings();
    const c = cols();
    const r = rows();

    await shuffleFlash(reelWindow, c, r, speed(500));

    const result = resolveSpin(c, r, settings, { flatMultiplier: 1, bonusMode: false });
    await playCascadeSequence(reelWindow, c, r, result);

    const winAmount = Math.round(result.totalMultiplierUnits * bet);
    settleStats(bet, winAmount);
    document.getElementById("hudWin").textContent = winAmount.toLocaleString();
    refreshHud();

    const gotJackpot = await maybeInstantJackpot(settings);

    const freeSpinsAwarded = freeSpinsForJesterCount(result.initialJesterCount);
    if (freeSpinsAwarded > 0) {
      await runBonus(freeSpinsAwarded, result.initialJesterCount, bet);
    }

    isSpinning = false;

    if (autoPlay && autoSpinsLeft > 0) {
      autoSpinsLeft--;
      if (autoSpinsLeft > 0 && player.credits >= bet) {
        await sleep(speed(400));
        playSpin();
      } else {
        autoPlay = false;
      }
    }
  }

  document.getElementById("btnSpin").addEventListener("click", () => playSpin());

  document.getElementById("btnBet").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = Math.max(0, betIndex - 1);
    refreshHud();
  });

  document.getElementById("btnMegaWays").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = Math.min(betLevels.length - 1, betIndex + 1);
    refreshHud();
  });

  document.getElementById("btnMaxBet").addEventListener("click", () => {
    if (isSpinning) return;
    betIndex = betLevels.length - 1;
    refreshHud();
    playSpin();
  });

  document.getElementById("btnFastSpin").addEventListener("click", (e) => {
    fastSpin = !fastSpin;
    e.target.style.filter = fastSpin ? "brightness(1.6)" : "none";
  });

  document.getElementById("btnAutoPlay").addEventListener("click", (e) => {
    if (autoPlay) {
      autoPlay = false;
      autoSpinsLeft = 0;
      e.target.style.filter = "none";
      return;
    }
    const input = prompt("Auto spins (10, 25, 50, 100, 500):", "10");
    const n = parseInt(input, 10);
    if (!n || n <= 0) return;
    autoPlay = true;
    autoSpinsLeft = n;
    e.target.style.filter = "brightness(1.6)";
    playSpin();
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
