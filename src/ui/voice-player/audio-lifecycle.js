// ===================== ui/voice-player/audio-lifecycle.js =====================
// Жизненный цикл <audio> для голосовых/трек-плееров (waveform-player.js, track-player.js): реестр смонтированных плееров (старт одного паузит остальные, как в Telegram) и переключение иконок play/pause.
import { clamp01, playQuietly } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';

// Иконки play/pause в кнопке плеера: видимую выбирает CSS по aria-pressed (css/voice-player.css), его ставит wireVoiceAudio. Готовая разметка - вставлять через raw().
const PLAY_PAUSE_SVG = `<svg class="ic-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <svg class="ic-pause" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;

// Кнопка play/pause. extraClass - доп. класс (например 'track-play').
export function playButtonHtml(extraClass = ''){
  const cls = ['voice-play', extraClass].filter(Boolean).join(' ');
  return html`<button class="${cls}" type="button" aria-label="${t('voicePlayer.play')}" aria-pressed="false">
        ${raw(PLAY_PAUSE_SVG)}
      </button>`;
}

// Перемотка по клику/касанию: currentTime по положению clientX в el. Возвращает долю [0..1] или null, если длительность неизвестна.
export function seekByClick(audio, el, clientX){
  if(!audio.duration) return null;
  const rect = el.getBoundingClientRect();
  const frac = clamp01((clientX - rect.left) / rect.width);
  audio.currentTime = frac * audio.duration;
  return frac;
}

// Общий таймлайн: длительность из метаданных, текущее время, конец воспроизведения.
//   onDuration(duration)          - после loadedmetadata (0, если неизвестна)
//   onTime(currentTime, duration) - на каждый timeupdate
//   onEnded(duration)             - по окончании
export function bindTimeline(audio, {onDuration, onTime, onEnded}){
  let duration = 0;
  audio.addEventListener('loadedmetadata', () => {
    duration = audio.duration || 0;
    onDuration(duration);
  });
  audio.addEventListener('timeupdate', () => onTime(audio.currentTime, duration));
  audio.addEventListener('ended', () => onEnded(duration));
}

// <audio> плеера: до первого play - только метаданные.
function createVoiceAudio(blobUrl){
  const audio = new Audio(blobUrl);
  audio.preload = 'metadata';
  return audio;
}

// Общий каркас обоих плееров: разметка в host -> <audio> -> элементы по селекторам.
// selectors - {имя: css-селектор}; возвращает {audio, els: {имя: Element|null}}. Таймлайн (bindTimeline) и wireVoiceAudio вызывает плеер сам: колбэки у режимов разные.
export function mountVoiceFrame(host, blobUrl, markup, selectors){
  setHTML(host, markup);
  const audio = createVoiceAudio(blobUrl);
  const els = {};
  for(const [name, selector] of Object.entries(selectors)) els[name] = host.querySelector(selector);
  return { audio, els };
}

// Реестр плееров: при старте одного остальные ставятся на паузу. Запись {audio, host}; host нужен для самоочистки ниже.
const voiceAudios = [];

// Убирает записи, чей host не в DOM. Окно списка (render-messages.js, virtual-list.js) выгружает и заново монтирует строки, поэтому без чистки voiceAudios рос бы всю сессию, цикл паузы по мёртвым Audio() замедлялся бы, а GC их не собирал.
function pruneDetached(){
  for(let i = voiceAudios.length - 1; i >= 0; i--){
    const host = voiceAudios[i].host;
    if(host && !host.isConnected) voiceAudios.splice(i, 1);
  }
}

// Регистрирует audio в реестре и вешает play/pause: переключают aria-pressed кнопки и паузят остальные плееры. host - контейнер (.media-frame/.media-embed): в нём ищется .voice-play, он же нужен pruneDetached(). onPlay/onPause - доп. колбэки плеера (например, прогресс в track-player.js).
export function wireVoiceAudio(audio, host, {onPlay, onPause} = {}){
  pruneDetached();
  voiceAudios.push({audio, host});
  // Кнопка - toggle-button (WAI-ARIA APG): состояние выражено программно, иначе screen reader всегда читает «Воспроизвести». Оно же переключает иконки в CSS. <button class="voice-play"> (у трека ещё .track-play).
  const btn = host.querySelector('.voice-play');
  btn.addEventListener('click', () => {
    if(audio.paused) playQuietly(audio); else audio.pause();
  });
  const setPlaying = on => {
    btn.setAttribute('aria-label', t(on ? 'voicePlayer.pause' : 'voicePlayer.play'));
    btn.setAttribute('aria-pressed', String(on));
  };
  audio.addEventListener('play', () => {
    setPlaying(true);
    voiceAudios.forEach(entry => { if(entry.audio !== audio) entry.audio.pause(); });
    if(onPlay) onPlay();
  });
  audio.addEventListener('pause', () => { setPlaying(false); if(onPause) onPause(); });
}

