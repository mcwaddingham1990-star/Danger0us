/*
  Starts the lobby ambience + generative music bed (wind, lightning, card
  swishes, motorcycle revs, a 100bpm-ish bass pulse) on the first
  tap/click/keypress, since browsers block audio until there's been user
  interaction.
*/
(function () {
  let started = false;
  function start() {
    if (started) return;
    started = true;
    DrAudio.start();
    DrAudio.enterScene("lobby");
    document.removeEventListener("click", start);
    document.removeEventListener("touchstart", start);
    document.removeEventListener("keydown", start);
  }
  document.addEventListener("click", start);
  document.addEventListener("touchstart", start);
  document.addEventListener("keydown", start);
})();
