'use strict';
const soundButton = document.getElementById('sound');
const sounds = {
  shot: ['triangle', 550, 140, .075],
  hit: ['square', 190, 65, .09],
  hurt: ['sawtooth', 160, 44, .23],
  alarm: ['square', 380, 760, .32],
  boss: ['sawtooth', 180, 48, .65],
};
let soundEnabled = true, audioContext;
let lastSounds = {}, nextTone = {};
function unlockAudio() {
  if (!soundEnabled || !window.AudioContext) return;
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch { /* Gameplay remains available when the device has no audio output. */ }
}
function resetSounds(counters) {
  lastSounds = {...counters};
  nextTone = {};
}
function playSounds(counters) {
  for (const kind of Object.keys(sounds)) {
    const changed = counters[kind] > lastSounds[kind];
    lastSounds[kind] = counters[kind];
    if (!changed || !soundEnabled || audioContext?.state !== 'running') continue;
    const now = audioContext.currentTime;
    if (now < (nextTone[kind] || 0)) continue;
    const [type, start, end, duration] = sounds[kind];
    nextTone[kind] = now + duration;
    const tone = audioContext.createOscillator(), gain = audioContext.createGain();
    tone.type = type;
    tone.frequency.setValueAtTime(start, now);
    tone.frequency.exponentialRampToValueAtTime(end, now + duration);
    gain.gain.setValueAtTime(.001, now);
    gain.gain.exponentialRampToValueAtTime(.055, now + .008);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    tone.connect(gain).connect(audioContext.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(now); tone.stop(now + duration);
  }
}
soundButton.onclick = () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute('aria-pressed', String(soundEnabled));
  soundButton.textContent = soundEnabled ? 'Звук: вкл.' : 'Звук: выкл.';
  if (soundEnabled) unlockAudio();
  else audioContext?.suspend().catch(() => {});
  soundButton.blur();
};
