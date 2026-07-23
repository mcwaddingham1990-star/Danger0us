/*
  Spawns a steady flurry of real card-photo sprites from behind the
  joker, each flying its own randomized course toward either the
  top-left or top-right corner. Every card gets its own Web Animations
  API animation (not a shared CSS keyframe) so paths genuinely differ
  instead of everything tracing one line with staggered timing.

  Path variety is pulled from a fixed pool of 24 distinct angle/
  distance/speed combos, each usable mirrored left or right — 48
  effective courses. A rolling history of the last 19 picks (path +
  direction together) is excluded from selection, which guarantees the
  exact same course can't repeat within any run of 20 cards.
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
    const angleDeg = 6 + ((i * 3.1) % 78); // spread from nearly-flat to nearly-vertical
    const dist = 200 + ((i * 41) % 260); // 200-460px — wider spread for a chaotic burst
    const rad = (angleDeg * Math.PI) / 180;
    PATHS.push({
      dx: Math.round(Math.cos(rad) * dist),
      dy: -Math.round(Math.sin(rad) * dist),
      duration: 650 + ((i * 53) % 500), // 650-1150ms — fast
    });
  }

  const HISTORY_LIMIT = 19; // same course can't repeat within any 20-card run
  const recent = [];

  function pickCourse() {
    let key, idx, dir;
    do {
      idx = Math.floor(Math.random() * PATHS.length);
      dir = Math.random() < 0.5 ? -1 : 1; // -1 = left, 1 = right
      key = idx + "_" + dir;
    } while (recent.includes(key));
    recent.push(key);
    if (recent.length > HISTORY_LIMIT) recent.shift();
    return { path: PATHS[idx], dir };
  }

  const GLOW_REST = "drop-shadow(0 0 6px rgba(80,180,255,0.8)) drop-shadow(0 0 14px rgba(50,150,255,0.5)) brightness(1)";
  const GLOW_PEAK = "drop-shadow(0 0 9px rgba(80,180,255,1)) drop-shadow(0 0 20px rgba(50,150,255,0.75)) brightness(1.3)";

  function spawn() {
    const img = document.createElement("img");
    img.className = "stream-card";
    img.src = CARD_IMAGES[Math.floor(Math.random() * CARD_IMAGES.length)];
    img.style.left = (47 + (Math.random() * 8 - 4)) + "%";
    img.style.top = (15 + (Math.random() * 8 - 4)) + "%";
    container.appendChild(img);

    const { path, dir } = pickCourse();
    const dx = path.dx * dir;
    const startScale = 0.75 + Math.random() * 0.2;
    const endScale = 0.35 + Math.random() * 0.2;
    const startRot = (Math.random() * 60 - 30);
    const endRot = startRot + dir * (120 + Math.random() * 200);

    const anim = img.animate(
      [
        { transform: `translate(0px, 0px) rotate(${startRot}deg) scale(${startScale})`, opacity: 0, filter: GLOW_REST },
        { offset: 0.1, opacity: 1 },
        { offset: 0.5, filter: GLOW_PEAK },
        { offset: 0.75, opacity: 1 },
        { transform: `translate(${dx}px, ${path.dy}px) rotate(${endRot}deg) scale(${endScale})`, opacity: 0, filter: GLOW_REST },
      ],
      { duration: path.duration, easing: "linear" }
    );

    anim.onfinish = () => img.remove();
  }

  setInterval(spawn, 90);
  spawn();
  spawn();
  spawn();
})();
