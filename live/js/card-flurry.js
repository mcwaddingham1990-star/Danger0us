/*
  Spawns a steady flurry of real card-photo sprites from behind the
  joker, each flying its own randomized course toward the top-right
  corner. Every card gets its own Web Animations API animation (not a
  shared CSS keyframe) so paths genuinely differ instead of everything
  tracing one line with staggered timing.

  Path variety is pulled from a fixed pool of 24 distinct angle/
  distance/speed combos. A rolling history of the last 19 picks is
  excluded from selection, which guarantees the same path can't repeat
  within any run of 20 cards.
*/
(function () {
  const container = document.getElementById("cardStream");
  if (!container) return;

  const CARD_IMAGES = [
    "images/cards/blue-card-1.png",
    "images/cards/blue-card-2.png",
    "images/cards/blue-card-3.png",
    "images/cards/blue-card-4.png",
    "images/cards/blue-card-5.png",
    "images/cards/blue-card-6.png",
  ];

  const PATHS = [];
  for (let i = 0; i < 24; i++) {
    const angleDeg = 12 + ((i * 2.71) % 68); // spread from near-flat to near-vertical, always up-and-right
    const dist = 190 + ((i * 37) % 190); // 190-380px
    const rad = (angleDeg * Math.PI) / 180;
    PATHS.push({
      dx: Math.round(Math.cos(rad) * dist),
      dy: -Math.round(Math.sin(rad) * dist),
      duration: 850 + ((i * 53) % 550), // 850-1400ms — fast
    });
  }

  const HISTORY_LIMIT = 19; // same path can't repeat within any 20-card run
  const recent = [];

  function pickPathIndex() {
    let idx;
    do {
      idx = Math.floor(Math.random() * PATHS.length);
    } while (recent.includes(idx));
    recent.push(idx);
    if (recent.length > HISTORY_LIMIT) recent.shift();
    return idx;
  }

  const GLOW_REST = "drop-shadow(0 0 6px rgba(80,180,255,0.8)) drop-shadow(0 0 14px rgba(50,150,255,0.5)) brightness(1)";
  const GLOW_PEAK = "drop-shadow(0 0 9px rgba(80,180,255,1)) drop-shadow(0 0 20px rgba(50,150,255,0.75)) brightness(1.3)";

  function spawn() {
    const img = document.createElement("img");
    img.className = "stream-card";
    img.src = CARD_IMAGES[Math.floor(Math.random() * CARD_IMAGES.length)];
    img.style.left = (48 + (Math.random() * 6 - 3)) + "%";
    img.style.top = (18 + (Math.random() * 6 - 3)) + "%";
    container.appendChild(img);

    const path = PATHS[pickPathIndex()];
    const startScale = 0.8 + Math.random() * 0.15;
    const endScale = 0.4 + Math.random() * 0.15;

    const anim = img.animate(
      [
        { transform: `translate(0px, 0px) scale(${startScale})`, opacity: 0, filter: GLOW_REST },
        { offset: 0.1, opacity: 1 },
        { offset: 0.5, filter: GLOW_PEAK },
        { offset: 0.75, opacity: 1 },
        { transform: `translate(${path.dx}px, ${path.dy}px) scale(${endScale})`, opacity: 0, filter: GLOW_REST },
      ],
      { duration: path.duration, easing: "linear" }
    );

    anim.onfinish = () => img.remove();
  }

  setInterval(spawn, 160);
  spawn();
})();
