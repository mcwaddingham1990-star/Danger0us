const TICKER_NAMES = [
  "DangBruh722", "MidnightRiderX", "VelvetVenom", "JesterJunkie88",
  "ChromeFangs", "NightShiftNina", "BlackoutBaller", "SkullAndSpurs",
  "LuckyLowGlow", "RavenReels99", "ScrollSeekerJT", "PhantomThrottle",
  "SapphireSpinz", "GothGrinder", "PitLaneQueen", "CrimsonClutch",
  "WraithRiderZ", "NeonNocturne", "HighRollerHal", "MoonlitMenace",
];

const TICKER_EVENTS = [
  (name, amt) => `${name} just cashed out jackpot earnings, ${amt} credits!`,
  (name, amt) => `${name} landed a mega cluster win of ${amt} credits!`,
  (name, amt) => `${name} triggered Bonus Spins and walked away with ${amt} credits!`,
  (name, amt) => `${name} climbed to a 5x multiplier and banked ${amt} credits!`,
  (name, amt) => `${name} just went from 82 credits to ${amt} credits in one session!`,
];

function tickerRandomItem() {
  const name = TICKER_NAMES[Math.floor(Math.random() * TICKER_NAMES.length)];
  const amt = Math.floor(82 + Math.random() * (2001 - 82)).toLocaleString();
  const template = TICKER_EVENTS[Math.floor(Math.random() * TICKER_EVENTS.length)];
  return template(name, amt);
}

function startTicker(container, intervalMs) {
  if (!container) return;
  intervalMs = intervalMs || 4200;

  function cycle() {
    const el = document.createElement("div");
    el.className = "ticker-item";
    el.textContent = tickerRandomItem();

    container.querySelectorAll(".ticker-item").forEach((old) => {
      old.classList.remove("show");
    });

    container.appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add("show"));
    });

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 700);
    }, intervalMs - 700);
  }

  cycle();
  return setInterval(cycle, intervalMs);
}
