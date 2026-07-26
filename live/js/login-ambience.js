/*
  Starts the login-screen ambience (drone, wind, thunder, raven, chains,
  heartbeat) on the first tap/click/keypress, since browsers block audio
  until there's been user interaction. Also layers the real background
  track on top — not a replacement for the ambience, both play together.
*/
(function () {
  let started = false;
  function start() {
    if (started) return;
    started = true;
    DrAudio.start();
    DrAudio.enterScene("login");
    DrAudio.startCustomTrack("dread-descent.m4a", { gain: 0.35 });
    document.removeEventListener("click", start);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("keydown", start);
  }
  document.addEventListener("click", start);
  document.addEventListener("touchstart", start);
  document.addEventListener("keydown", start);
})();
