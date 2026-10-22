// ===================== ui/voice-player/waveform-player.js =====================
// Режим 1: обычная голосовая запись (без ID3) - компактная строка с амплитудной волной вместо нативных <audio controls>. Разметка/события - здесь, стили волны - css/voice-player.css, пики - waveform-peaks.js.
import { formatMmSs } from '../../core/dom-utils.js';
import { createLruMemo } from '../../core/lru-map.js';
import { html, setHTML } from '../../core/safe-html.js';

import { bindTimeline, mountVoiceFrame, playButtonHtml, seekByClick, wireVoiceAudio } from './audio-lifecycle.js';
import { computeWaveformPeaks } from './waveform-peaks.js';

// Кэш амплитудных пиков по blobUrl (как mount.js:_prepared): blobUrl стабилен между перерисовками, AudioContext/decodeAudioData не гоняем заново. Размер ограничен (core/lru-map.js).
const _peaksCache = createLruMemo(200); // blobUrl -> Promise<number[] (Float32Array-like)>

const computePeaksOnce = (blobUrl, arrayBuffer) =>
  _peaksCache(blobUrl, () => computeWaveformPeaks(arrayBuffer));

const barsHtml = peaks => html`${peaks.map(p => html`<i style="height:${Math.max(4, Math.round(p * 100))}%"></i>`)}`;

// host - контейнер (.media-frame или .media-embed), blobUrl - расшифрованный файл, arrayBuffer - те же байты для расчёта волны.
export async function mountWaveformPlayer(host, blobUrl, arrayBuffer){
  const markup = html`
    <div class="voice-msg">
      ${playButtonHtml()}
      <div class="voice-body">
        <div class="voice-wave"></div>
        <div class="voice-time">${formatMmSs(0)}</div>
      </div>
    </div>`;

  const { audio, els } = mountVoiceFrame(host, blobUrl, markup, { wave: '.voice-wave', timeEl: '.voice-time' });
  const { wave, timeEl } = els;
  // Доля воспроизведённого (0..1) - переменная --p; яркий слой волны обрезается по ней в CSS.
  const setProgress = frac => wave.style.setProperty('--p', frac);

  bindTimeline(audio, {
    onDuration: duration => { timeEl.textContent = formatMmSs(duration); },
    onTime: (currentTime, duration) => {
      if(duration > 0) setProgress(currentTime / duration);
      timeEl.textContent = formatMmSs(currentTime);
    },
    onEnded: duration => {
      setProgress(0);
      timeEl.textContent = formatMmSs(duration);
    },
  });
  wireVoiceAudio(audio, host);

  wave.addEventListener('click', (e) => {
    const frac = seekByClick(audio, wave, e.clientX);
    if(frac !== null) setProgress(frac);
  });

  const bars = barsHtml(await computePeaksOnce(blobUrl, arrayBuffer));
  setHTML(wave, html`<div class="bars">${bars}</div><div class="bars played">${bars}</div>`);
}
