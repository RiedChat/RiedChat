// ===================== features/video-note/canvas.js =====================
// Рисует кадр живого превью в скрытый канвас: центрированный квадратный кроп (constraints - пожелание, не гарантия пропорций).
// Цикл работает, пока жив рекордер; при смене камеры канвас читает тот же <video> с подменённым srcObject.
//
// Круг вшит в пиксели записи, а не только в CSS: канвас клипуется ctx.clip() по окружности, поэтому .webm круглый (углы - чёрный фон),
// как кружки в Telegram, и остаётся круглым при скачивании (без CSS border-radius).
import { $ } from '../../core/dom-utils.js';

import { S, CANVAS_SIZE } from './state.js';

export function drawFrame(){
  const preview = $('video-note-preview');
  S.canvasCtx.save();
  S.canvasCtx.fillStyle = '#000';
  S.canvasCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  S.canvasCtx.beginPath();
  S.canvasCtx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
  S.canvasCtx.closePath();
  S.canvasCtx.clip();
  if(preview.videoWidth && preview.videoHeight){
    const vw = preview.videoWidth, vh = preview.videoHeight;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2, sy = (vh - side) / 2;
    S.canvasCtx.drawImage(preview, sx, sy, side, side, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
  S.canvasCtx.restore();
  S.rafHandle = requestAnimationFrame(drawFrame);
}
