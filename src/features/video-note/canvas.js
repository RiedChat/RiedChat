// ===================== features/video-note/canvas.js =====================
// Рисует текущий кадр видимого превью (живая камера) в скрытый канвас -
// центрированный квадратный кроп, на случай если реальные пропорции потока
// не совпали ровно с запрошенными width/height/aspectRatio (constraints -
// это пожелание, а не гарантия). Держит цикл, пока рекордер жив; сам канвас
// не завязан на конкретный поток - при смене камеры просто продолжает читать
// пиксели того же <video>, которому снаружи подменили srcObject.
//
// КРУГ ПЕЧЁТСЯ ПРЯМО В ПИКСЕЛИ ЗАПИСИ, А НЕ ТОЛЬКО В CSS: канвас клипуется
// через ctx.clip() по окружности перед отрисовкой кадра, поэтому итоговый
// .webm сам по себе круглый (углы - залитый чёрным фон), как кружки в
// Telegram, а не квадратный ролик, который выглядит круглым только из-за
// border-radius на <video> в чате. Так и при скачивании файла куда угодно
// (в галерею, другому клиенту без такого CSS) он остаётся круглым.
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
