(async () => {
const session = await drRequireSessionOrRedirect("signin.html");
let player = session ? await drCurrentPlayer() : null;

if (player) {
  const cols = () => GRID_COLS;
  const rows = () => GRID_ROWS;

  const TILE_SIZE_BOOST = 1.14;

  let bet = 1;
  let isSpinning = false;
  let reducedFx = localStorage.getItem("drReducedFx") === "1";

  function roundBet(v) { return Math.round(v * 100) / 100; }
  function formatCredits(v) { return (Math.round(v * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  const reelWindow = document.getElementById("reelWindow");
  const hudBet = document.getElementById("hudBet");
  const hudCredits = document.getElementById("hudCredits");
  const hudWin = document.getElementById("hudWin");
  const creditsTop = document.getElementById("creditsTop");
  const betVal = document.getElementById("betVal");
  const winFlashLayer = document.getElementById("winFlashLayer");

  function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function applyReducedFx() {
    document.body.classList.toggle("reduced-fx", reducedFx);
  }
  applyReducedFx();
  document.getElementById("btnFxToggle").addEventListener("click", () => {
    reducedFx = !reducedFx;
    localStorage.setItem("drReducedFx", reducedFx ? "1" : "0");
    applyReducedFx();
    DrAudio.clickSound();
  });

  function showWinFlash(text, kind) {
    const el = document.createElement("div");
    el.className = "win-flash-text " + (kind || "cascade");
    el.textContent = text;
    el.addEventListener("animationend", () => el.remove());
    winFlashLayer.appendChild(el);
  }

  function showBigWinTier(winAmount, betAmount) {
    const tier = bigWinTierFor(winAmount, betAmount);
    if (!tier) return;
    const cls = tier.name === "BIG WIN" ? "tier-big" : tier.name === "MEGA WIN" ? "tier-mega" : tier.name === "INSANE WIN" ? "tier-insane" : "tier-deathride";
    const el = document.createElement("div");
    el.className = "win-flash-text big-win-tier " + cls;
    el.textContent = tier.name + "!  " + formatCredits(winAmount) + " CREDITS";
    el.addEventListener("animationend", () => el.remove());
    winFlashLayer.appendChild(el);
    if ((tier.name === "INSANE WIN" || tier.name === "DEATH RIDE WIN") && navigator.vibrate && !reducedFx) {
      navigator.vibrate([60, 40, 60, 40, 120]);
    }
    DrAudio.multiplierHit(tier.name === "DEATH RIDE WIN" ? 10 : tier.name === "INSANE WIN" ? 5 : 3);
  }

  function refreshHud() {
    hudBet.textContent = bet.toFixed(1);
    hudCredits.textContent = formatCredits(player.credits);
    creditsTop.textContent = formatCredits(player.credits) + " cr";
    if (betVal) betVal.textContent = bet.toFixed(1);
  }

  // ---- Cell rendering --------------------------------------------------

  function cellImage(cell) {
    if (!cell) return "";
    if (cell.kind === "bonus") return BONUS_SYMBOL_IMGS[0];
    if (cell.kind === "joker") return JOKER_IMGS[0];
    const family = familyById(cell.family);
    return family ? symbolImage(family, cell.color) : "";
  }

  function cellExtraClass(cell) {
    if (!cell) return null;
    if (cell.kind === "bonus") return "bonus-symbol";
    if (cell.kind === "joker") return "joker-" + cell.tier;
    return null;
  }

  // Compatible with the existing audio manifest's LANDING_RULES (red-moto,
  // red-lady, red-cash, red-watch, red-letter*, jester) — reusing those
  // sounds rather than wiring up a new audio path for this rewrite.
  function cellLandingId(cell) {
    if (!cell) return "";
    if (cell.kind === "joker") return "jester";
    if (cell.kind === "symbol" && cell.color === "red") return "red-" + cell.family.replace("letter-", "letter-");
    return "";
  }

  function makeTile(cell, extraClass) {
    const cls = ["tile"];
    if (extraClass) cls.push(extraClass);
    const auto = cellExtraClass(cell);
    if (auto) cls.push(auto);
    const tile = document.createElement("div");
    tile.className = cls.join(" ");
    const img = cellImage(cell);
    if (img) tile.style.backgroundImage = `url('${img}')`;
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
        for (let ri = 0; ri < r; ri++) {
          const tile = makeTile(grid[ri][ci], "falling");
          tile.style.flex = "0 0 " + (100 / r) + "%";
          tile.dataset.r = ri;
          tile.dataset.c = ci;
          strip.appendChild(tile);
        }
      } else {
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

  // ---- Win animation ------------------------------------------------
  //
  // Non-negotiable sequence from the design brief:
  //   1. winning tiles briefly darken (80-120ms)
  //   2. flash back on, brighter, each with its own electric-blue heated
  //      edge that pulses twice ("crawls")
  //   3. ONE white-hot outline around the connected cluster's outer
  //      perimeter only (never the seams between touching symbols)
  //   4. points appear over the cluster's center and count upward
  //      (tap/press-Spin to accelerate)
  //   5. cluster erupts into blue fire/sparks/glass fragments
  //   6. symbols disappear, remaining symbols fall, new ones enter
  //
  // Timing scales with cluster size — small wins stay quick and sharp,
  // large wins get a longer, more dramatic beat, per the brief.

  function sizeTierFor(size) {
    if (size >= 25) return "huge";
    if (size >= 15) return "large";
    if (size >= 8) return "medium";
    return "small";
  }
  const TIER_TIMING = {
    small: { glow: 300, countMs: 320, sparks: 5, shards: 2 },
    medium: { glow: 420, countMs: 480, sparks: 7, shards: 3 },
    large: { glow: 550, countMs: 650, sparks: 9, shards: 4 },
    huge: { glow: 700, countMs: 900, sparks: 12, shards: 6 },
  };

  let activeSkip = null; // set while a count-up is running so Spin/tap can fast-forward it

  function requestSkip() {
    if (activeSkip) activeSkip();
  }

  function clusterCentroidPx(container, containerRect, cells) {
    let sx = 0, sy = 0, n = 0;
    cells.forEach(([r, c]) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      if (!tile) return;
      const rect = tile.getBoundingClientRect();
      sx += rect.left - containerRect.left + rect.width / 2;
      sy += rect.top - containerRect.top + rect.height / 2;
      n++;
    });
    return n ? { x: sx / n, y: sy / n } : null;
  }

  function spawnBurstAt(container, cx, cy, tileW, tileH, tier) {
    const boom = document.createElement("div");
    boom.className = "explosion";
    boom.style.left = cx + "px";
    boom.style.top = cy + "px";
    boom.style.width = (tileW * 1.9) + "px";
    boom.style.height = (tileH * 1.9) + "px";
    container.appendChild(boom);
    boom.addEventListener("animationend", () => boom.remove());
    if (reducedFx) return;

    const t = TIER_TIMING[tier];
    for (let i = 0; i < t.sparks; i++) {
      const angle = (i / t.sparks) * Math.PI * 2 + Math.random() * 0.6;
      const dist = 18 + Math.random() * 24;
      const spark = document.createElement("div");
      spark.className = "spark";
      spark.style.left = cx + "px";
      spark.style.top = cy + "px";
      spark.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      spark.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      container.appendChild(spark);
      spark.addEventListener("animationend", () => spark.remove());
    }
    for (let i = 0; i < t.shards; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 14 + Math.random() * 26;
      const shard = document.createElement("div");
      shard.className = "glass-shard";
      shard.style.left = cx + "px";
      shard.style.top = cy + "px";
      shard.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      shard.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      shard.style.setProperty("--rot", (Math.random() * 360 - 180) + "deg");
      container.appendChild(shard);
      shard.addEventListener("animationend", () => shard.remove());
    }
  }

  function drawClusterEdges(container, containerRect, cells) {
    const cellSet = new Set(cells.map(([r, c]) => r + "," + c));
    const NEIGHBORS = [["up", -1, 0], ["down", 1, 0], ["left", 0, -1], ["right", 0, 1]];
    cells.forEach(([r, c]) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      if (!tile) return;
      const tileRect = tile.getBoundingClientRect();
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
  }

  function drawJokerChainLinks(container, containerRect, jokerCells) {
    if (reducedFx || jokerCells.length < 2) return;
    const pts = jokerCells.map(([r, c]) => {
      const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
      if (!tile) return null;
      const rect = tile.getBoundingClientRect();
      return { x: rect.left - containerRect.left + rect.width / 2, y: rect.top - containerRect.top + rect.height / 2 };
    }).filter(Boolean);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (pts.length === 2 && i === 1) break;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const link = document.createElement("div");
      link.className = "joker-chain-link";
      link.style.left = a.x + "px";
      link.style.top = a.y + "px";
      link.style.width = len + "px";
      link.style.transform = `rotate(${angle}deg)`;
      container.appendChild(link);
      setTimeout(() => link.remove(), 1000);
    }
  }

  // Plays one cascade step's full win sequence for every cluster in it
  // simultaneously, then resolves once points have counted up and the
  // explosion has started (caller waits a bit more before re-rendering
  // the fallen/refilled grid).
  function playWinSequence(container, step, betAmount, dom) {
    return new Promise((resolve) => {
      const clusters = step.clusters;
      const awards = step.awards;
      if (!clusters.length) { resolve(); return; }

      const containerRect = container.getBoundingClientRect();
      const biggestSize = Math.max(...awards.map((a) => a.size));
      const tier = sizeTierFor(biggestSize);
      const timing = TIER_TIMING[tier];

      container.classList.add("win-focus");

      // Beat 1: darken (80-120ms), then beat 2: flash back on brighter
      // with the per-tile electric-blue "crawl" pulse, twice.
      const darkenMs = 90 + Math.random() * 30;
      clusters.forEach((cluster) => {
        cluster.cells.forEach(([r, c]) => {
          const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
          if (tile) tile.classList.add("win-darken");
        });
      });

      setTimeout(() => {
        clusters.forEach((cluster) => {
          cluster.cells.forEach(([r, c]) => {
            const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
            if (!tile) return;
            tile.classList.remove("win-darken");
            tile.style.animationDuration = (timing.glow / 1000) + "s";
            tile.classList.add("winning");
          });
        });

        // Beat 3: white-hot outer perimeter, once the blue has had a beat
        // to read on its own.
        setTimeout(() => {
          clusters.forEach((cluster) => drawClusterEdges(container, containerRect, cluster.cells));
        }, Math.round(timing.glow * 0.4));

        // Joker Chain Reaction visual, same beat as the outline.
        setTimeout(() => {
          clusters.forEach((cluster, i) => {
            const award = awards[i];
            if (award && award.chainReaction) {
              const jokerCells = cluster.cells.filter(([r, c]) => {
                const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
                return tile && tile.className.indexOf("joker-") !== -1;
              });
              drawJokerChainLinks(container, containerRect, jokerCells);
            }
          });
        }, Math.round(timing.glow * 0.45));

        // Beat 4: points appear over each cluster's center and count up;
        // tap/press-Spin accelerates. Small wins count fast, large wins
        // take longer to land — never so long it blocks the next spin.
        const countStart = Math.round(timing.glow * 0.55);
        setTimeout(() => {
          let remaining = clusters.length;
          const pointEls = [];
          clusters.forEach((cluster, i) => {
            const award = awards[i];
            const centroid = clusterCentroidPx(container, containerRect, cluster.cells);
            if (!centroid) { remaining--; return; }
            const el = document.createElement("div");
            el.className = "cluster-points";
            el.style.left = centroid.x + "px";
            el.style.top = centroid.y + "px";
            el.textContent = "0.0";
            container.appendChild(el);
            pointEls.push(el);

            const durMs = Math.max(180, timing.countMs * Math.min(2, 0.4 + award.award / (betAmount * 20)));
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              el.textContent = award.award.toFixed(1);
              remaining--;
              if (remaining === 0) afterCountUp();
            };
            DrAudio.animateCountUp(el, 0, award.award, durMs, "win_count");
            setTimeout(finish, durMs + 30);
            el._forceFinish = finish;
          });

          activeSkip = () => pointEls.forEach((el) => el._forceFinish && el._forceFinish());

          function afterCountUp() {
            activeSkip = null;
            setTimeout(() => {
              pointEls.forEach((el) => el.remove());
              clusters.forEach((cluster) => {
                cluster.cells.forEach(([r, c]) => {
                  const tile = container.querySelector(`.tile[data-r="${r}"][data-c="${c}"]`);
                  if (!tile) return;
                  const rect = tile.getBoundingClientRect();
                  const cx = rect.left - containerRect.left + rect.width / 2;
                  const cy = rect.top - containerRect.top + rect.height / 2;
                  spawnBurstAt(container, cx, cy, rect.width, rect.height, tier);
                });
              });
              container.classList.remove("shaking", "shaking-big");
              void container.offsetWidth;
              container.classList.add(tier === "large" || tier === "huge" ? "shaking-big" : "shaking");
              if ((tier === "large" || tier === "huge") && navigator.vibrate && !reducedFx) navigator.vibrate(tier === "huge" ? 70 : 40);

              setTimeout(() => {
                container.classList.remove("win-focus");
                resolve();
              }, 260);
            }, 120);
          }
        }, countStart);
      }, darkenMs);
    });
  }

  // ---- Cascade multiplier / heat meter / overdrive UI ------------------

  function updateCascadeBadge(dom, mult, justIncreased) {
    dom.cascadeBadge.textContent = "×" + mult;
    dom.cascadeBadge.classList.add("show");
    if (justIncreased) {
      dom.cascadeBadge.classList.remove("slam");
      void dom.cascadeBadge.offsetWidth;
      dom.cascadeBadge.classList.add("slam");
      DrAudio.multiplierHit(mult);
    }
  }

  function updateHeatMeter(dom, heat, threshold) {
    const pct = Math.max(0, Math.min(100, (heat / threshold) * 100));
    dom.heatFill.style.width = pct + "%";
    dom.heatWrap.classList.toggle("hot", pct >= 85);
  }

  function triggerOverdrive(dom) {
    dom.overdriveFlash.classList.remove("show");
    void dom.overdriveFlash.offsetWidth;
    dom.overdriveFlash.classList.add("show");
    dom.overdriveBanner.classList.remove("show");
    void dom.overdriveBanner.offsetWidth;
    dom.overdriveBanner.classList.add("show");
    DrAudio.multiplierHit(10);
  }

  function triggerInferno(dom) {
    dom.infernoBorder.classList.remove("show");
    void dom.infernoBorder.offsetWidth;
    dom.infernoBorder.classList.add("show");
    DrAudio.jackpot();
  }

  function showDeathRideBanner(dom, level) {
    if (!dom.deathRideBanner) return;
    document.getElementById(dom.levelNumId).textContent = level.level;
    document.getElementById(dom.levelNameId).textContent = level.name;
    dom.deathRideBanner.classList.remove("show");
    void dom.deathRideBanner.offsetWidth;
    dom.deathRideBanner.classList.add("show");
  }

  function showJesterTakeover(dom, takeover) {
    if (!takeover) return;
    const headline = document.getElementById(dom.takeoverHeadlineId);
    const sub = document.getElementById(dom.takeoverSubId);
    headline.textContent = "JESTER TAKEOVER";
    sub.textContent = takeover.name.toUpperCase() + " — " + takeover.upgrades + " UPGRADES" + (takeover.jokers ? ", " + takeover.jokers + " JOKER" + (takeover.jokers > 1 ? "S" : "") : "");
    dom.jesterTakeover.classList.remove("show", "total");
    if (takeover.name === "total") dom.jesterTakeover.classList.add("total");
    void dom.jesterTakeover.offsetWidth;
    dom.jesterTakeover.classList.add("show");
    DrAudio.bonusTrigger();
  }

  function showBlueJesterDeathRide(dom) {
    if (!dom.deathRideEvent) return;
    dom.deathRideEvent.classList.remove("show");
    void dom.deathRideEvent.offsetWidth;
    dom.deathRideEvent.classList.add("show");
    DrAudio.jackpot();
    if (navigator.vibrate && !reducedFx) navigator.vibrate([100, 60, 100, 60, 200]);
  }

  function showBreakdown(award) {
    const panel = document.getElementById("breakdownPanel");
    if (!award) { panel.innerHTML = "No win yet this spin."; return; }
    panel.innerHTML =
      `<div>Cluster size <span>${award.size}</span></div>` +
      `<div>Color score <span>${award.colorScore.toFixed(1)}</span></div>` +
      `<div>Avg color val <span>${award.avgColorValue.toFixed(2)}</span></div>` +
      `<div>Size mult <span>×${award.sizeMult}</span></div>` +
      `<div>Joker effects <span>×${award.jokerEffectsMult.toFixed(2)}</span></div>` +
      `<div>Cascade mult <span>×${award.effectiveCascadeMult}</span></div>` +
      `<div>Award <span>${award.award.toFixed(2)}</span></div>`;
  }
  let lastAward = null;
  document.getElementById("btnBreakdownToggle").addEventListener("click", () => {
    const panel = document.getElementById("breakdownPanel");
    panel.classList.toggle("show");
    if (panel.classList.contains("show")) showBreakdown(lastAward);
    DrAudio.clickSound();
  });

  // ---- Cascade loop -----------------------------------------------------

  async function playCascadeFrom(container, c, r, result, betAmount, dom) {
    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      const isIncrease = i > 1 || (dom.startingMultiplier != null && step.cascadeMultiplier > dom.startingMultiplier);
      updateCascadeBadge(dom, step.cascadeMultiplier, true);
      updateHeatMeter(dom, step.heat, dom.heatThreshold);

      step.awards.forEach((a) => { lastAward = a; });
      if (document.getElementById("breakdownPanel").classList.contains("show")) showBreakdown(lastAward);

      DrAudio.winHit(step.awards.reduce((s, a) => s + a.size, 0), i - 1);
      await playWinSequence(container, step, betAmount, dom);
      if (step.stepWin > 0) showWinFlash("+" + step.stepWin.toFixed(1) + " CREDITS", "cascade");

      if (step.awards.some((a) => a.blueJesterDeathRide)) showBlueJesterDeathRide(dom);

      renderGrid(container, step.grid, c, r, true);
      DrAudio.cascadeSlam(i - 1);
      await sleep(220);
    }
  }

  function settleStats(betAmount, winAmount) {
    player.credits += winAmount - betAmount;
    player.creditsPlayed = (player.creditsPlayed || 0) + betAmount;
    player.creditsWon = (player.creditsWon || 0) + winAmount;
    player.creditsLost = (player.creditsLost || 0) + Math.max(0, betAmount - winAmount);
    drUpsertPlayer(player).catch(console.error);
  }

  // ---- Reel spin reveal (unchanged mechanics, generic cell renderer) ---

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
  const spinEase = cubicBezierEase(0.16, 0.85, 0.3, 1.0);

  function randomFillerCell() {
    const r = Math.random();
    if (r < 0.03) return { kind: "joker", tier: "plain" };
    const family = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];
    const colorRoll = Math.random();
    const color = colorRoll < 0.7 ? "plain" : colorRoll < 0.93 ? "red" : "blue";
    return { kind: "symbol", family: family.id, color };
  }

  function spinReveal(container, c, r, finalGrid) {
    return new Promise((resolve) => {
      const extraRows = Math.min(34, Math.round(r * 5.5));
      const stripLen = extraRows + r;

      setupGridContainer(container);
      container.innerHTML = "";
      DrAudio.reelStart();

      const rowHeightPx = container.clientHeight / r;
      const targetY = -(extraRows * rowHeightPx);
      const perColDelay = Math.max(90, 280 - c * 8);
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
          const cell = isFinal ? finalGrid[ri][ci] : randomFillerCell();
          const tile = makeTile(cell, null);
          tile.style.flex = "0 0 " + rowHeightPx + "px";
          strip.appendChild(tile);
        }

        col.appendChild(strip);
        container.appendChild(col);

        const delay = ci * perColDelay;
        const isLastCol = ci === c - 1;

        setTimeout(() => {
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

        setTimeout(() => { col.classList.add("landed"); }, delay + baseDuration);

        setTimeout(() => {
          remaining--;
          if (remaining === 0) {
            renderGrid(container, finalGrid, c, r, false);
            const landedIds = finalGrid.flat().map(cellLandingId).filter(Boolean);
            DrAudio.symbolsLanded(landedIds);
            resolve();
          }
        }, delay + baseDuration + 100);
      }
    });
  }

  // ---- Bonus round -------------------------------------------------------

  const baseDom = {
    cascadeBadge: document.getElementById("cascadeBadge"),
    heatFill: document.getElementById("heatMeterFill"),
    heatWrap: document.getElementById("heatMeterWrap"),
    heatThreshold: HEAT.base.threshold,
    overdriveFlash: document.getElementById("overdriveFlash"),
    overdriveBanner: document.getElementById("overdriveBanner"),
    infernoBorder: document.getElementById("infernoBorder"),
    deathRideBanner: null, // base game has no Death Ride levels
    jesterTakeover: document.getElementById("jesterTakeover"),
    takeoverHeadlineId: "takeoverHeadline",
    takeoverSubId: "takeoverSub",
    deathRideEvent: document.getElementById("deathRideEvent"),
  };

  const bonusDom = {
    cascadeBadge: document.getElementById("bonusCascadeBadge"),
    heatFill: document.getElementById("bonusHeatMeterFill"),
    heatWrap: document.getElementById("bonusHeatMeterWrap"),
    heatThreshold: HEAT.bonus.threshold,
    overdriveFlash: document.getElementById("bonusOverdriveFlash"),
    overdriveBanner: document.getElementById("overdriveBanner"),
    infernoBorder: document.getElementById("bonusInfernoBorder"),
    deathRideBanner: document.getElementById("bonusDeathRideBanner"),
    levelNumId: "bonusDeathRideLevelNum",
    levelNameId: "bonusDeathRideLevelName",
    jesterTakeover: document.getElementById("bonusJesterTakeover"),
    takeoverHeadlineId: "bonusTakeoverHeadline",
    takeoverSubId: "bonusTakeoverSub",
    deathRideEvent: document.getElementById("bonusDeathRideEvent"),
  };

  async function runBonus(freeSpinsAwarded, bonusSymbolCountInitial, lockedBet) {
    document.getElementById("jesterCountText").textContent = bonusSymbolCountInitial;
    document.getElementById("freeSpinsAwarded").textContent = freeSpinsAwarded;
    document.getElementById("bonusAnnounce").classList.add("show");
    DrAudio.bonusTrigger();
    await sleep(2200);
    document.getElementById("bonusAnnounce").classList.remove("show");

    const bonusPlayEl = document.getElementById("bonusPlay");
    const bonusReelWindow = document.getElementById("bonusReelWindow");
    bonusPlayEl.classList.add("show");

    let spinsLeft = freeSpinsAwarded;
    let cascadeMultiplier = 1;
    let heat = 0;
    let bonusWinTotal = 0;
    let highestMult = 1;
    let biggestCascadeOverall = 0;
    let highestLevel = deathRideLevelFor(1);
    let anyDeathRide = false;

    bonusDom.startingMultiplier = 1;
    updateCascadeBadge(bonusDom, 1, false);
    updateHeatMeter(bonusDom, 0, bonusDom.heatThreshold);

    while (spinsLeft > 0) {
      spinsLeft--;
      document.getElementById("bonusSpinsLeft").textContent = spinsLeft;

      const settings = await drGetEffectiveSettings(player);
      const result = resolveSpin(BONUS_COLS, BONUS_ROWS, settings, lockedBet, {
        bonusMode: true,
        startingCascadeMultiplier: cascadeMultiplier,
        startingHeat: heat,
        jokerRateMultiplier: 2.5,
        redBlueBoost: 2,
        allowJesterTakeover: true,
      });

      if (result.takeover) showJesterTakeover(bonusDom, result.takeover);
      await sleep(result.takeover ? 900 : 0);

      await spinReveal(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result.steps[0].grid);
      await sleep(150);
      bonusDom.startingMultiplier = cascadeMultiplier;
      await playCascadeFrom(bonusReelWindow, BONUS_COLS, BONUS_ROWS, result, lockedBet, bonusDom);

      const spinWin = roundBet(result.totalWin);
      bonusWinTotal += spinWin;
      cascadeMultiplier = result.endingCascadeMultiplier;
      heat = result.overdriveTriggeredThisSpin ? 0 : result.endingHeat;
      if (result.overdriveTriggeredThisSpin) triggerOverdrive(bonusDom);
      if (result.fullGridInferno) triggerInferno(bonusDom);
      if (result.anyBlueJesterDeathRide) anyDeathRide = true;

      const newLevel = deathRideLevelFor(cascadeMultiplier);
      if (newLevel.level > highestLevel.level) {
        highestLevel = newLevel;
        showDeathRideBanner(bonusDom, newLevel);
      }
      if (cascadeMultiplier > highestMult) highestMult = cascadeMultiplier;
      biggestCascadeOverall = Math.max(biggestCascadeOverall, result.biggestCluster);

      spinsLeft += result.bonusSymbolSpinsAwarded + result.extraSpinsEarned;
      if (result.bonusSymbolSpinsAwarded > 0) showWinFlash("+" + result.bonusSymbolSpinsAwarded + " SPINS", "bonus");
      if (result.extraSpinsEarned > 0) showWinFlash("+" + result.extraSpinsEarned + " SPINS", "bonus");

      showBigWinTier(spinWin, lockedBet);

      document.getElementById("bonusMultiplier").textContent = "×" + cascadeMultiplier;
      document.getElementById("bonusWinTotal").textContent = formatCredits(bonusWinTotal);

      await sleep(250);
    }

    player.credits += bonusWinTotal;
    player.creditsWon = (player.creditsWon || 0) + bonusWinTotal;
    drUpsertPlayer(player).catch(console.error);
    refreshHud();

    bonusPlayEl.classList.remove("show");
    bonusDom.cascadeBadge.classList.remove("show");
    bonusDom.deathRideBanner.classList.remove("show");

    document.getElementById("endTotalWin").textContent = formatCredits(bonusWinTotal);
    document.getElementById("endBiggestCascade").textContent = biggestCascadeOverall;
    document.getElementById("endHighestMult").textContent = "×" + highestMult;
    document.getElementById("endDeathRideLevel").textContent = "LEVEL " + highestLevel.level + " — " + highestLevel.name + (anyDeathRide ? " (BLUE JESTER DEATH RIDE!)" : "");
    document.getElementById("bonusEnd").classList.add("show");
  }

  function closeBonusEnd() {
    document.getElementById("bonusEnd").classList.remove("show");
  }

  // ---- Base-game spin -----------------------------------------------------

  async function playSpin() {
    if (isSpinning) return;
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

    const result = resolveSpin(c, r, settings, bet, { bonusMode: false, startingCascadeMultiplier: 1, startingHeat: 0 });

    await spinReveal(reelWindow, c, r, result.steps[0].grid);
    await sleep(150);

    baseDom.startingMultiplier = 1;
    updateCascadeBadge(baseDom, 1, false);
    updateHeatMeter(baseDom, 0, baseDom.heatThreshold);
    await playCascadeFrom(reelWindow, c, r, result, bet, baseDom);

    if (result.overdriveTriggeredThisSpin) triggerOverdrive(baseDom);

    const winAmount = roundBet(result.totalWin);
    settleStats(bet, winAmount);
    const prevWin = parseFloat(document.getElementById("hudWin").textContent) || 0;
    DrAudio.animateCountUp(document.getElementById("hudWin"), prevWin, winAmount, 700, "win_count");
    refreshHud();
    showBigWinTier(winAmount, bet);

    baseDom.cascadeBadge.classList.remove("show");

    const freeSpinsAwarded = result.bonusSymbolSpinsAwarded;
    if (freeSpinsAwarded > 0) {
      await runBonus(freeSpinsAwarded, result.bonusCountInitial, bet);
    }

    isSpinning = false;
    document.getElementById("btnSpinFloat").classList.remove("disabled");
  }

  // ---- Controls ------------------------------------------------------

  document.querySelectorAll(".ctrl-btn, .stepper-btn").forEach((btn) => {
    btn.addEventListener("mouseenter", () => DrAudio.hoverSound());
  });

  document.getElementById("btnSpinFloat").addEventListener("click", () => {
    if (activeSkip) { requestSkip(); return; }
    DrAudio.start();
    DrAudio.enterScene("game");
    DrAudio.spinButtonPress();
    playSpin();
  });

  reelWindow.addEventListener("click", () => requestSkip());
  document.getElementById("bonusReelWindow").addEventListener("click", () => requestSkip());

  const muteBtn = document.getElementById("btnMute");
  muteBtn.addEventListener("click", () => {
    DrAudio.start();
    DrAudio.enterScene("game");
    DrAudio.clickSound();
    const next = !DrAudio.isMuted();
    DrAudio.setMuted(next);
    muteBtn.textContent = next ? "🔇" : "🔊";
  });

  function setBet(v) {
    bet = roundBet(Math.max(MIN_BET, Math.min(MAX_BET, v)));
    refreshHud();
  }

  document.getElementById("btnMinBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    setBet(MIN_BET);
  });

  document.getElementById("btnBetDownFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    setBet(bet - BET_STEP);
  });

  document.getElementById("btnBetUpFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    setBet(bet + BET_STEP);
  });

  document.getElementById("btnMaxBetFloat").addEventListener("click", () => {
    if (isSpinning) return;
    DrAudio.clickSound();
    setBet(MAX_BET);
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
