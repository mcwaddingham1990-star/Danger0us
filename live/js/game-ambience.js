/*
  Starts the game-screen ambience + background track on the first
  tap/click/keypress anywhere on the page — not just the Spin/Mute
  buttons — since browsers block audio until there's been user
  interaction. Same pattern as lobby-ambience.js/login-ambience.js.
*/
(function () {
  let started = false;
  function start() {
    if (started) return;
    started = true;
    DrAudio.start();
    DrAudio.enterScene("game");
    DrAudio.startCustomTrack("last-lever-pull.mp3", { gain: 0.4 });
    document.removeEventListener("click", start);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("keydown", start);
  }
  document.addEventListener("click", start);
  document.addEventListener("touchstart", start);
  document.addEventListener("keydown", start);
})();
