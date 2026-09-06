// ===================== ui/voice-player/track-player.js =====================
// Режим 2: музыкальный файл с ID3-тегами (TIT2/TPE1/обложка) - карточка трека:
// обложка/иконка с play-кнопкой поверх, название, исполнитель+длительность,
// при воспроизведении вторая строка меняется на бегунок с таймкодом.
// Выделено из ui/voice-player.js.
import { html, raw, setHTML } from '../../core/safe-html.js';
import { wireVoiceAudio } from './audio-lifecycle.js';
import { t } from '../../i18n/t.js';

const fmt = (s) => {
  if(!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
};

export function mountTrackPlayer(host, blobUrl, tags){
  const bubble = host.closest('.bubble');
  if(bubble) bubble.classList.add('has-track');
  host.classList.add('track-frame');

  const title = tags.title || t('voicePlayer.untitled');
  const artist = tags.artist || '';

  setHTML(host, html`
    <div class="voice-msg track-msg">
      <div class="track-avatar">
        <div class="track-avatar-clip">
          ${tags.cover ? html`<img src="${raw(tags.cover)}" alt="">` : raw(`<div class="track-avatar-fallback">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>
          </div>`)}
          <button class="voice-play track-play" type="button" aria-label="${t('voicePlayer.play')}">
            <svg class="ic-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="ic-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>
        </div>
      </div>
      <div class="voice-body track-body">
        <div class="track-title">${title}</div>
        <div class="track-static">
          <span class="track-duration">…</span>${artist ? html`<span class="track-dot">•</span><span class="track-artist">${artist}</span>` : ''}
        </div>
        <div class="track-progress" style="display:none">
          <span class="track-time">0:00</span>
          <span class="track-bar"><span class="track-bar-fill"></span><span class="track-bar-dot"></span></span>
        </div>
      </div>
    </div>`);

  const audio = new Audio(blobUrl);
  audio.preload = 'metadata';

  const btn = host.querySelector('.track-play');
  const iconPlay = host.querySelector('.ic-play');
  const iconPause = host.querySelector('.ic-pause');
  const durationEl = host.querySelector('.track-duration');
  const staticRow = host.querySelector('.track-static');
  const progressRow = host.querySelector('.track-progress');
  const timeEl = host.querySelector('.track-time');
  const barFill = host.querySelector('.track-bar-fill');
  const barDot = host.querySelector('.track-bar-dot');
  const bar = host.querySelector('.track-bar');

  let duration = 0;

  const updateBar = (frac) => {
    frac = Math.min(1, Math.max(0, frac));
    barFill.style.width = (frac * 100) + '%';
    barDot.style.left = (frac * 100) + '%';
  };

  const updateRows = () => {
    const started = audio.currentTime > 0 || !audio.paused;
    staticRow.style.display = started ? 'none' : '';
    progressRow.style.display = started ? '' : 'none';
  };

  audio.addEventListener('loadedmetadata', () => {
    duration = audio.duration || 0;
    durationEl.textContent = fmt(duration);
  });
  audio.addEventListener('timeupdate', () => {
    timeEl.textContent = fmt(audio.currentTime);
    if(duration > 0) updateBar(audio.currentTime / duration);
    updateRows();
  });
  wireVoiceAudio(audio, iconPlay, iconPause, {onPlay: updateRows});
  audio.addEventListener('ended', () => {
    audio.currentTime = 0; updateBar(0); updateRows();
    timeEl.textContent = '0:00';
  });

  btn.addEventListener('click', () => {
    if(audio.paused) audio.play().catch(() => {}); else audio.pause();
  });

  // Клик и перетаскивание бегунка (мышь/тач) - как в Telegram.
  const seekFromEvent = (e) => {
    if(!duration) return;
    const rect = bar.getBoundingClientRect();
    const clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX);
    const frac = (clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, frac));
    audio.currentTime = clamped * duration;
    updateBar(clamped);
  };
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => { dragging = true; seekFromEvent(e); e.preventDefault(); });
  window.addEventListener('pointermove', (e) => { if(dragging) seekFromEvent(e); });
  window.addEventListener('pointerup', () => { dragging = false; });
}

