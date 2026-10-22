// ===================== ui/voice-player/track-player.js =====================
// Режим 2: музыкальный файл с ID3 (TIT2/TPE1/обложка) - карточка трека: обложка/иконка с play поверх, название, исполнитель+длительность; при воспроизведении вторая строка - бегунок с таймкодом.
import { clamp01, formatMmSs } from '../../core/dom-utils.js';
import { html, raw } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';

import { bindTimeline, mountVoiceFrame, playButtonHtml, seekByClick, wireVoiceAudio } from './audio-lifecycle.js';

export function mountTrackPlayer(host, blobUrl, tags){
  const bubble = host.closest('.bubble');
  if(bubble) bubble.classList.add('has-track');
  host.classList.add('track-frame');

  const title = tags.title || t('voicePlayer.untitled');
  const artist = tags.artist || '';

  const markup = html`
    <div class="voice-msg track-msg">
      <div class="track-avatar">
        <div class="track-avatar-clip">
          ${tags.cover ? html`<img src="${raw(tags.cover)}" alt="">` : raw(`<div class="track-avatar-fallback">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z"/></svg>
          </div>`)}
          ${playButtonHtml('track-play')}
        </div>
      </div>
      <div class="voice-body track-body">
        <div class="track-title">${title}</div>
        <div class="track-static">
          <span class="track-duration">…</span>${artist ? html`<span class="track-dot">•</span><span class="track-artist">${artist}</span>` : ''}
        </div>
        <div class="track-progress" style="display:none">
          <span class="track-time">${formatMmSs(0)}</span>
          <span class="track-bar"><span class="track-bar-fill"></span><span class="track-bar-dot"></span></span>
        </div>
      </div>
    </div>`;

  const { audio, els } = mountVoiceFrame(host, blobUrl, markup, {
    durationEl: '.track-duration',
    staticRow: '.track-static',
    progressRow: '.track-progress',
    timeEl: '.track-time',
    barFill: '.track-bar-fill',
    barDot: '.track-bar-dot',
    bar: '.track-bar',
  });
  const { durationEl, staticRow, progressRow, timeEl, barFill, barDot, bar } = els;

  const updateBar = (frac) => {
    frac = clamp01(frac);
    barFill.style.width = (frac * 100) + '%';
    barDot.style.left = (frac * 100) + '%';
  };

  const updateRows = () => {
    const started = audio.currentTime > 0 || !audio.paused;
    staticRow.hidden = started;
    progressRow.hidden = !started;
  };

  bindTimeline(audio, {
    onDuration: duration => { durationEl.textContent = formatMmSs(duration); },
    onTime: (currentTime, duration) => {
      timeEl.textContent = formatMmSs(currentTime);
      if(duration > 0) updateBar(currentTime / duration);
      updateRows();
    },
    onEnded: () => {
      audio.currentTime = 0; updateBar(0); updateRows();
      timeEl.textContent = formatMmSs(0);
    },
  });
  wireVoiceAudio(audio, host, {onPlay: updateRows});

  // Клик и перетаскивание бегунка (мышь/тач), как в Telegram.
  const seekFromEvent = (e) => {
    const frac = seekByClick(audio, bar, e.clientX);
    if(frac !== null) updateBar(frac);
  };
  // setPointerCapture на bar (как в swipe-gesture.js) вместо window-слушателей pointermove/pointerup: move/up идут на bar, куда бы ни уехал палец. Раньше window-listener'ы вешались при каждом mountTrackPlayer() и не снимались - при перемонтировании плееров они копились всю сессию.
  let dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    dragging = true;
    bar.setPointerCapture(e.pointerId);
    seekFromEvent(e);
    e.preventDefault();
  });
  // Флаг dragging нужен: без него наведение мыши на bar без нажатия вызывало бы pointermove и двигало воспроизведение.
  bar.addEventListener('pointermove', (e) => { if(dragging) seekFromEvent(e); });
  bar.addEventListener('pointerup', (e) => {
    dragging = false;
    bar.releasePointerCapture(e.pointerId);
  });
  bar.addEventListener('pointercancel', () => { dragging = false; });
}

