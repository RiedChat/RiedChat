// ===================== ui/voice-player/audio-lifecycle.js =====================
// Общая часть жизненного цикла <audio> для голосовых/трек-плееров:
// реестр смонтированных плееров (чтобы ставить остальные на паузу при
// старте одного, как в Telegram) и переключение play/pause иконок.
// Выделено, т.к. этот код был почти дословно продублирован в
// _mountWaveformPlayer и _mountTrackPlayer.

// Реестр уже смонтированных голосовых-плееров: при старте воспроизведения
// одного нужно поставить остальные на паузу (как в Telegram).
export const voiceAudios = [];

// Регистрирует audio в общем реестре и вешает play/pause обработчики,
// которые переключают iconPlay/iconPause и ставят остальные плееры на паузу.
// onPlay/onPause - опциональные доп. колбэки конкретного плеера (например,
// обновление строки прогресса в track-player.js).
export function wireVoiceAudio(audio, iconPlay, iconPause, {onPlay, onPause} = {}){
  voiceAudios.push(audio);
  audio.addEventListener('play', () => {
    iconPlay.style.display = 'none'; iconPause.style.display = '';
    voiceAudios.forEach(a => { if(a !== audio) a.pause(); });
    if(onPlay) onPlay();
  });
  audio.addEventListener('pause', () => {
    iconPlay.style.display = ''; iconPause.style.display = 'none';
    if(onPause) onPause();
  });
}

