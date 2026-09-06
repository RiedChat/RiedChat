// ===================== ui/voice-player/waveform-draw.js =====================
// Отрисовка амплитудной волны на canvas и её ресайз под devicePixelRatio.
// Выделено из waveform-player.js: чистая работа с canvas, без DOM-разметки
// плеера и без вычисления самих пиков (см. waveform-peaks.js).

// Рисует peaks на canvas с учётом доли воспроизведённого (playedFrac, 0..1).
// color - цвет заливки баров (обычно getComputedStyle(host).color).
export function drawWaveform(canvas, cx, peaks, playedFrac, color){
  const w = canvas.width, h = canvas.height;
  cx.clearRect(0, 0, w, h);
  if(!peaks) return;
  const gap = w / peaks.length;
  const barW = Math.max(1, gap * 0.55);
  const playedBars = Math.round(peaks.length * playedFrac);
  cx.fillStyle = color;
  peaks.forEach((p, i) => {
    const barH = Math.max(2, p * h);
    const x = i * gap + (gap - barW) / 2;
    const y = (h - barH) / 2;
    cx.globalAlpha = i < playedBars ? 1 : 0.35;
    if(cx.roundRect){ cx.beginPath(); cx.roundRect(x, y, barW, barH, barW / 2); cx.fill(); }
    else cx.fillRect(x, y, barW, barH);
  });
  cx.globalAlpha = 1;
}

// Подгоняет размер canvas под текущий CSS-размер и devicePixelRatio,
// затем сразу перерисовывает волну через onResized (т.к. после смены
// canvas.width/height контекст сбрасывается).
export function sizeWaveformCanvas(canvas, onResized){
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 150, h = rect.height || 28;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  onResized();
}

