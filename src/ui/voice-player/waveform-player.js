// ===================== ui/voice-player/waveform-player.js =====================
// Режим 1: обычная запись голоса (нет ID3-тегов) - компактная строка
// с амплитудной волной вместо нативных <audio controls>.
// Разметка/события - здесь; отрисовка canvas - waveform-draw.js;
// вычисление пиков - waveform-peaks.js.
import { html, setHTML } from '../../core/safe-html.js';
import { drawWaveform, sizeWaveformCanvas } from './waveform-draw.js';
import { wireVoiceAudio } from './audio-lifecycle.js';
import { computeWaveformPeaks } from './waveform-peaks.js';
import { t } from '../../i18n/t.js';

const fmt = (s) => {
  if(!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
};

// host - контейнер (.media-frame либо .media-embed), blobUrl - расшифрованный
// файл, arrayBuffer - те же байты для расчёта амплитудной волны.
export async function mountWaveformPlayer(host, blobUrl, arrayBuffer){
  setHTML(host, html`
    <div class="voice-msg">
      <button class="voice-play" type="button" aria-label="${t('voicePlayer.play')}">
        <svg class="ic-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        <svg class="ic-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
      </button>
      <div class="voice-body">
        <canvas class="voice-wave"></canvas>
        <div class="voice-time">0:00</div>
      </div>
    </div>`);

  const audio = new Audio(blobUrl);
  audio.preload = 'metadata';

  const btn = host.querySelector('.voice-play');
  const iconPlay = host.querySelector('.ic-play');
  const iconPause = host.querySelector('.ic-pause');
  const canvas = host.querySelector('.voice-wave');
  const timeEl = host.querySelector('.voice-time');
  const cx = canvas.getContext('2d');

  let peaks = null;
  let duration = 0;
  let playedFrac = 0;

  const draw = () => {
    const color = getComputedStyle(host).color || '#000';
    drawWaveform(canvas, cx, peaks, playedFrac, color);
  };

  const sizeCanvas = () => sizeWaveformCanvas(canvas, draw);

  audio.addEventListener('loadedmetadata', () => {
    duration = audio.duration || 0;
    timeEl.textContent = fmt(duration);
  });
  audio.addEventListener('timeupdate', () => {
    if(duration > 0) playedFrac = audio.currentTime / duration;
    timeEl.textContent = fmt(audio.currentTime);
    draw();
  });
  wireVoiceAudio(audio, iconPlay, iconPause);
  audio.addEventListener('ended', () => {
    playedFrac = 0; draw();
    timeEl.textContent = fmt(duration);
  });

  btn.addEventListener('click', () => {
    if(audio.paused) audio.play().catch(() => {}); else audio.pause();
  });
  canvas.addEventListener('click', (e) => {
    if(!duration) return;
    const rect = canvas.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * duration;
    playedFrac = frac; draw();
  });

  requestAnimationFrame(sizeCanvas);
  peaks = await computeWaveformPeaks(arrayBuffer);
  sizeCanvas();
}

