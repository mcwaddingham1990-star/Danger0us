(async () => {
const session = await drRequireSessionOrRedirect("signin.html");
let player = session ? await drCurrentPlayer() : null;

if (player) {
  const cols = () => GRID_COLS;
  const rows = () => GRID_ROWS;
  // Red Devil's bonus round plays on the same 4x6 grid as the base
  // game — unlike Blue Diamonds, which swaps to a bigger 8x10 board.
  const BONUS_COLS = GRID_COLS;
  const BONUS_ROWS = GRID_ROWS;
  const MAX_GAMBLE_ROUNDS = 3;

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

  // Reels sit on a virtual cylinder, same geometry approach as Blue
  // Diamonds — see game.css's .tile comment for the full explanation.
  const CURVE_MAX_DEG = 42;

  function reelGeometry(r, windowHeightPx) {
    const anglePerRow = (2 * CURVE_MAX_DEG) / r;
    const anglePerRowRad = anglePerRow * Math.PI / 180;
    const rowHeightPx = (windowHeightPx || 1) / r;
    const radius = (rowHeightPx / 2) / Math.tan(anglePerRowRad / 2);
    return { anglePerRow, radius };
  }

  function slotAngleDeg(k, r, anglePerRow) {
    return ((r - 1) / 2 - k) * anglePerRow;
  }

  function makeTile(symId, k, r, geo, rowHPercent, extraClass) {
    const sym = symbolById(symId);
    const tile = document.createElement("div");
    tile.className = "tile" + (extraClass ? " " + extraClass : "");
    if (sym) tile.style.backgroundImage = `url('${pickSymbolImage(sym)}')`;
    tile.style.setProperty("--row-h", rowHPercent);
    tile.style.setProperty("--slot-angle", slotAngleDeg(k, r, geo.anglePerRow).toFixed(3) + "deg");
    return tile;
  }

  function setupGridContainer(container) {
    container.style.display = "flex";
    container.style.flexDirection = "row";
  }

  function renderGrid(container, grid, c, r) {
    setupGridContainer(container);
    container.innerHTML = "";
    const geo = reelGeometry(r, container.clientHeight);
    const rowHPercent = (100 / r) + "%";

    for (let ci = 0; ci < c; ci++) {
      const col = document.createElement("div");
      col.className = "reel-col";

      const cyl = document.createElement("div");
      cyl.className = "reel-cyl";
      cyl.style.setProperty("--reel-radius", geo.radius.toFixed(1) + "px");

      for (let ri = 0; ri < r; ri++) {
        const tile = makeTile(grid[ri][ci], ri, r, geo, rowHPercent, null);
        tile.dataset.r = ri;
        tile.dataset.c = ci;
        cyl.appendChild(tile);
      }
      col.appendChild(cyl);
      container.appendChild(col);
    }
  }

  function highlightCells(container, cells) {
    const containerRect = container.getBoundingClientRect();

    cells.forEach(([r, c]) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      if (!tile) return;
      tile.classList.add("winning");

      const tileRect = tile.getBoundingClientRect();
      const cx = tileRect.left - containerRect.left + tileRect.width / 2;
      const cy = tileRect.top - containerRect.top + tileRect.height / 2;

      const boom = document.createElement("div");
      boom.className = "explosion";
      boom.style.left = cx + "px";
      boom.style.top = cy + "px";
      boom.style.width = (tileRect.width * 1.7) + "px";
      boom.style.height = (tileRect.height * 1.7) + "px";
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

    container.classList.remove("shaking");
    void container.offsetWidth;
    container.classList.add("shaking");
  }

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
  const spinEase = cubicBezierEase(0.16, 0.85, 0.3, 1.12);

  function spinReveal(container, c, r, finalGrid) {
    return new Promise((resolve) => {
      const extraRows = 34;
      const stripLen = extraRows + r;

      setupGridContainer(container);
      container.innerHTML = "";

      DrAudio.reelStart();

      const geo = reelGeometry(r, container.clientHeight);
      const rowHPercent = (100 / r) + "%";
      const startWheel = -(extraRows + (r - 1) / 2) * geo.anglePerRow;

      const perColDelay = 280;
      const baseDuration = 2500;
      let remaining = c;

      for (let ci = 0; ci < c; ci++) {
        const col = document.createElement("div");
        col.className = "reel-col spinning";

        const cyl = document.createElement("div");
        cyl.className = "reel-cyl";
        cyl.style.setProperty("--reel-radius", geo.radius.toFixed(1) + "px");
        cyl.style.setProperty("--wheel-rotation", startWheel.toFixed(3) + "deg");

        for (let si = 0; si < stripLen; si++) {
          const isFinal = si >= extraRows;
          const ri = si - extraRows;
          const symId = isFinal
            ? finalGrid[ri][ci]
            : SYMBOL_SET[Math.floor(Math.random() * SYMBOL_SET.length)].id;
          cyl.appendChild(makeTile(symId, si - extraRows, r, geo, rowHPercent));
        }

        col.appendChild(cyl);
        container.appendChild(col);

        const delay = ci * perColDelay;
        const isLastCol = ci === c - 1;

        setTimeout(() => {
          const t0 = performance.now();
          function frame(now) {
            const t = Math.min(1, (now - t0) / baseDuration);
            const eased = spinEase(t);
            const wheel = startWheel + (0 - startWheel) * eased;
            cyl.style.setProperty("--wheel-rotation", wheel.toFixed(3) + "deg");
            if (t < 1) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }, 20 + delay);

        setTimeout(() => {
          col.classList.remove("spinning");
          DrAudio.reelStop(isLastCol);
        }, delay + baseDuration - 260);

        setTimeout(() => {
          remaining--;
          if (remaining === 0) {
            renderGrid(container, finalGrid, c, r);
            DrAudio.symbolsLanded(finalGrid.flat());
            resolve();
          }
        }, delay + baseDuration + 100);
      }
    });
  }

  async function revealWins(container, result) {
    if (result.wins.length === 0) return;
    const allCells = [];
    const seen = new Set();
    result.wins.forEach((w) => {
      w.cells.forEach(([r, c]) => {
        const key = r + "," + c;
        if (!seen.has(key)) {
          seen.add(key);
          allCells.push([r, c]);
        }
      });
    });
    highlightCells(container, allCells);
    DrAudio.winHit(allCells.length, 0);
    await sleep(650);
  }

  function settleStats(betAmount, winAmount) {
    player.credits += winAmount - betAmount;
    player.creditsPlayed = (player.creditsPlayed || 0) + betAmount;
    player.creditsWon = (player.creditsWon || 0) + winAmount;
    player.creditsLost = (player.creditsLost || 0) + Math.max(0, betAmount - winAmount);
    drUpsertPlayer(player).catch(console.error);
  }

  // Soul Gamble — after a base-game win, the player can risk it on a
  // red/black pick to double it (up to 3 times), or bank it as-is.
  // Blue Diamonds has no equivalent feature.
  function maybeOfferGamble(winAmount) {
    return new Promise((resolve) => {
      if (winAmount <= 0) { resolve(winAmount); return; }

      const overlay = document.getElementById("gambleOverlay");
      const potEl = document.getElementById("gamblePot");
      const resultEl = document.getElementById("gambleResult");
      const redBtn = document.getElementById("gambleRed");
      const blackBtn = document.getElementById("gambleBlack");
      const collectBtn = document.getElementById("gambleCollect");

      let pot = winAmount;
      let round = 0;
      resultEl.textContent = "";
      resultEl.className = "gamble-result";
      potEl.textContent = formatCredits(pot);
      overlay.classList.add("show");

      function cleanup(finalPot) {
        redBtn.removeEventListener("click", onRed);
        blackBtn.removeEventListener("click", onBlack);
        collectBtn.removeEventListener("click", onCollect);
        overlay.classList.remove("show");
        resolve(finalPot);
      }

      function pick(chosenColor) {
        round++;
        DrAudio.clickSound();
        const outcome = Math.random() < 0.5 ? "red" : "black";
        if (outcome === chosenColor) {
          pot = roundBet(pot * 2);
          potEl.textContent = formatCredits(pot);
          resultEl.textContent = "DOUBLED!";
          resultEl.className = "gamble-result win";
          if (round >= MAX_GAMBLE_ROUNDS) {
            setTimeout(() => cleanup(pot), 700);
          }
        } else {
          resultEl.textContent = "LOST IT ALL";
          resultEl.className = "gamble-result lose";
          setTimeout(() => cleanup(0), 700);
        }
      }

      function onRed() { pick("red"); }
      function onBlack() { pick("black"); }
      function onCollect() { cleanup(pot); }

      redBtn.addEventListener("click", onRed);
      blackBtn.addEventListener("click", onBlack);
      collectBtn.addEventListener("click", onCollect);
    });
  }

  async function runBonus(spinsAwarded, wildCountInitial, lockedBet) {
    document.getElementById("wildCountText").textContent = wildCountInitial;
    document.getElementById("hellfireSpinsAwarded").textContent = spinsAwarded;
    document.getElementById("bonusAnnounce").classList.add("show");
    DrAudio.bonusTrigger();
    await sleep(2200);
    document.getElementById("bonusAnnounce").classList.remove("show");

    const bonusPlayEl = document.getElementById("bonusPlay");
    const bonusReelWindow = document.getElementById("bonusReelWindow");
    bonusPlayEl.classList.add("show");

    let spinsLeft = spinsAwarded;
    let spinIndex = 0;
    let bonusWinTotal = 0;
    let highestMult = 1;
    let biggestRunOverall = 0;

    while (spinsLeft > 0) {
      spinsLeft--;
      spinIndex++;
      document.getElementById("bonusSpinsLeft").textContent = spinsLeft;

      const hellfireMultiplier = hellfireMultiplierForSpinIndex(spinIndex);
      document.getElementById("bonusMultiplier").textContent = hellfireMultiplier + "x";
      if (hellfireMultiplier > highestMult) {
        highestMult = hellfireMultiplier;
        DrAudio.multiplierHit(highestMult);
      }

      const result = resolveSpin(BONUS_COLS, BONUS_ROWS, { hellfireMultiplier });

      await spinReveal(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result.grid);
      await sleep(200);
      await revealWins(bonusReelWindow, result);

      const spinWin = roundBet(result.totalMultiplierUnits * lockedBet);
      bonusWinTotal += spinWin;
      if (spinWin > 0) showWinFlash("+" + spinWin.toFixed(1) + " CREDITS", "bonus");
      biggestRunOverall = Math.max(biggestRunOverall, result.biggestRun);

      document.getElementById("bonusWinTotal").textContent = formatCredits(bonusWinTotal);
      await sleep(350);
    }

    player.credits += bonusWinTotal;
    player.creditsWon = (player.creditsWon || 0) + bonusWinTotal;
    drUpsertPlayer(player).catch(console.error);
    refreshHud();

    bonusPlayEl.classList.remove("show");

    document.getElementById("endTotalWin").textContent = formatCredits(bonusWinTotal);
    document.getElementById("endBiggestRun").textContent = biggestRunOverall;
    document.getElementById("endHighestMult").textContent = highestMult + "x";
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

    const c = cols();
    const r = rows();

    const result = resolveSpin(c, r, {});

    await spinReveal(reelWindow, c, r, result.grid);
    await sleep(200);
    await revealWins(reelWindow, result);

    let winAmount = roundBet(result.totalMultiplierUnits * bet);

    const spinsAwarded = hellfireSpinsForWildCount(result.wildCount);
    if (spinsAwarded > 0) {
      // Hellfire is settled straight away; gamble only applies to
      // ordinary base-game line wins, not the bonus trigger itself.
      settleStats(bet, winAmount);
      const prevWin = parseFloat(document.getElementById("hudWin").textContent) || 0;
      DrAudio.animateCountUp(document.getElementById("hudWin"), prevWin, winAmount, 700, "win_count");
      refreshHud();
      await runBonus(spinsAwarded, result.wildCount, bet);
    } else {
      if (winAmount > 0) {
        winAmount = await maybeOfferGamble(winAmount);
      }
      settleStats(bet, winAmount);
      const prevWin = parseFloat(document.getElementById("hudWin").textContent) || 0;
      DrAudio.animateCountUp(document.getElementById("hudWin"), prevWin, winAmount, 700, "win_count");
      refreshHud();
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

  // Draw the 6 straight-payline guides once, sized to the grid.
  const guides = document.getElementById("paylineGuides");
  for (let i = 0; i < GRID_ROWS; i++) {
    const g = document.createElement("div");
    g.className = "guide";
    g.style.top = (((i + 0.5) / GRID_ROWS) * 100) + "%";
    guides.appendChild(g);
  }

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
