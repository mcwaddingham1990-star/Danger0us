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

  /*
    Reels sit on a virtual cylinder (see the .tile/.reel-col comment in
    game.css) — each row occupies a fixed angular slot, spread evenly
    across a total arc of CURVE_MAX_DEG*2 centered on the window.
  */
  const CURVE_MAX_DEG = 42;

  function reelGeometry(r, windowHeightPx) {
    const anglePerRow = (2 * CURVE_MAX_DEG) / r;
    const anglePerRowRad = anglePerRow * Math.PI / 180;
    const rowHeightPx = (windowHeightPx || 1) / r;
    const radius = (rowHeightPx / 2) / Math.tan(anglePerRowRad / 2);
    return { anglePerRow, radius };
  }

  // k=0 is the topmost row; k=r-1 is the bottommost. Works for k outside
  // [0, r-1] too (filler rows further round the cylinder during a spin).
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

  function renderGrid(container, grid, c, r, fallingCells) {
    setupGridContainer(container);
    container.innerHTML = "";
    const geo = reelGeometry(r, container.clientHeight);
    const rowHPercent = ((100 / r) * TILE_SIZE_BOOST) + "%";

    for (let ci = 0; ci < c; ci++) {
      const col = document.createElement("div");
      col.className = "reel-col";

      const cyl = document.createElement("div");
      cyl.className = "reel-cyl";
      cyl.style.setProperty("--reel-radius", geo.radius.toFixed(1) + "px");

      for (let ri = 0; ri < r; ri++) {
        const tile = makeTile(grid[ri][ci], ri, r, geo, rowHPercent, fallingCells ? "falling" : null);
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

      // Positioned from the tile's actual rendered (post-3D-transform)
      // bounding box, not its pre-transform layout box — the curved
      // reels mean those two are very different now. Appended to the
      // reel-window, not the tile — .tile has overflow:hidden (for its
      // background-image) which would clip a burst/sparks meant to
      // spill outside the tile's own bounds.
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

    // container is the reel-window (main or bonus) itself.
    container.classList.remove("shaking");
    // Force reflow so re-adding the class restarts the animation on
    // back-to-back cascades instead of a no-op if it's already there.
    void container.offsetWidth;
    container.classList.add("shaking");
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
  const spinEase = cubicBezierEase(0.16, 0.85, 0.3, 1.12);

  /*
    Realistic reel spin: each column mounts a strip of filler symbols
    followed by the real final column values as tiles on a shared
    cylinder, then rotates the whole cylinder (one inherited CSS custom
    property per column, per frame) until the final segment faces
    forward. Staggered left to right so columns stop one after another,
    with a motion-blur while moving fast that clears just before it
    settles.
  */
  function spinReveal(container, c, r, finalGrid) {
    return new Promise((resolve) => {
      const extraRows = 34;
      const stripLen = extraRows + r;

      setupGridContainer(container);
      container.innerHTML = "";

      DrAudio.reelStart();

      const geo = reelGeometry(r, container.clientHeight);
      // Unboosted here on purpose: the cylinder radius is derived from
      // each row's real (unboosted) angular slot, so oversizing tiles
      // while a whole packed strip is rotating makes neighboring tiles'
      // enlarged edges visually overlap mid-spin — two symbols blending
      // into one square until it settles. The boost only applies once
      // the reel is static (see renderGrid).
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
      DrAudio.winHit(cells.length, i - 1);
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
