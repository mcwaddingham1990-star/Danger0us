/*
  Starts the login-screen ambience (drone, wind, thunder, raven, chains,
  heartbeat) on the first tap/click/keypress, since browsers block audio
  until there's been user interaction.
*/
(function () {
  let started = false;
  function start() {
    if (started) return;
    started = true;
    DrAudio.start();
    DrAudio.enterScene("login");
    document.removeEventListener("click", start);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("keydown", start);
  }
  document.addEventListener("click", start);
  document.addEventListener("touchstart", start);
  document.addEventListener("keydown", start);
})();
