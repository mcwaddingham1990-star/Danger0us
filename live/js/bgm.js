/*
  Shared background music for the auth pages and dashboard. Starts on
  the first tap/click/keypress anywhere on the page since browsers block
  autoplay with sound until there's been user interaction. Looks for the
  file at audio/theme.mp3 — silently does nothing if it's not there yet.
*/
(function () {
  const audio = new Audio("audio/theme.mp3");
  audio.loop = true;
  audio.volume = 0.35;
  audio.preload = "auto";

  let started = false;
  function start() {
    if (started) return;
    started = true;
    audio.play().catch(() => { started = false; });
    document.removeEventListener("click", start);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("keydown", start);
  }

  document.addEventListener("click", start);
  document.addEventListener("touchstart", start);
  document.addEventListener("keydown", start);
})();
