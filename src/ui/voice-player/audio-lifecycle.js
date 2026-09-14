// ===================== ui/voice-player/audio-lifecycle.js =====================
// Общая часть жизненного цикла <audio> для голосовых/трек-плееров:
// реестр смонтированных плееров (чтобы ставить остальные на паузу при
// старте одного, как в Telegram) и переключение play/pause иконок.
// Выделено, т.к. этот код был почти дословно продублирован в
// _mountWaveformPlayer и _mountTrackPlayer.
import { t } from '../../i18n/t.js';

// Реестр уже смонтированных голосовых-плееров: при старте воспроизведения
// одного нужно поставить остальные на паузу (как в Telegram). Хранит записи
// {audio, host} - host нужен только для самоочистки ниже, сам плеер по нему
// не ищется нигде за пределами этого файла.
export const voiceAudios = [];

// Убирает из реестра записи, чей host уже не в DOM. render-messages.js
// (ui/chat-view/render-messages.js:renderMessages) полностью пересобирает
// список сообщений на каждое новое событие в чате и заново монтирует уже
// показанные ранее голосовые/трек-плееры - без этой чистки voiceAudios рос
// без остановки на всю сессию (по записи на каждый такой ремонт), и цикл
// "поставить остальные на паузу" в audio.addEventListener('play', ...) ниже
// со временем перебирал бы всё больше мёртвых Audio(), которые к тому же
// сами никогда не собирались GC, пока висели в этом массиве.
function pruneDetached(){
  for(let i = voiceAudios.length - 1; i >= 0; i--){
    const host = voiceAudios[i].host;
    if(host && !host.isConnected) voiceAudios.splice(i, 1);
  }
}

// Регистрирует audio в общем реестре и вешает play/pause обработчики,
// которые переключают iconPlay/iconPause и ставят остальные плееры на паузу.
// onPlay/onPause - опциональные доп. колбэки конкретного плеера (например,
// обновление строки прогресса в track-player.js). host - контейнер плеера в
// DOM (.media-frame/.media-embed), нужен только для pruneDetached() выше.
export function wireVoiceAudio(audio, iconPlay, iconPause, {onPlay, onPause, host} = {}){
  pruneDetached();
  voiceAudios.push({audio, host});
  // Кнопка play/pause - toggle-button (WAI-ARIA APG Button Pattern): её
  // состояние должно быть выражено программно, а не только цветом/видимой
  // иконкой, иначе для screen reader она навсегда остаётся "Воспроизвести",
  // даже когда запись уже играет. iconPlay/iconPause лежат прямо внутри
  // <button class="voice-play">/<button class="track-play"> - closest('button')
  // всегда находит именно её.
  const btn = iconPlay.closest('button');
  audio.addEventListener('play', () => {
    iconPlay.style.display = 'none'; iconPause.style.display = '';
    if(btn){
      btn.setAttribute('aria-label', t('voicePlayer.pause'));
      btn.setAttribute('aria-pressed', 'true');
    }
    voiceAudios.forEach(entry => { if(entry.audio !== audio) entry.audio.pause(); });
    if(onPlay) onPlay();
  });
  audio.addEventListener('pause', () => {
    iconPlay.style.display = ''; iconPause.style.display = 'none';
    if(btn){
      btn.setAttribute('aria-label', t('voicePlayer.play'));
      btn.setAttribute('aria-pressed', 'false');
    }
    if(onPause) onPause();
  });
}

