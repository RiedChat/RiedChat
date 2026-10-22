// ===================== features/call/mirror-track.js =====================
// Зеркалит исходящий видеотрек по горизонтали через canvas.captureStream(). Класс .mirrored в call.css разворачивает только локальное превью,
// поэтому собеседник видел движения зеркально. Модуль рисует кадры камеры в скрытый canvas со scale(-1,1) и отдаёт его видеотрек вместо исходного.
import { playQuietly } from '../../core/dom-utils.js';
import { makeCanvas } from '../../core/image-utils.js';

export function createMirroredVideoTrack(sourceTrack){
  const settings = sourceTrack.getSettings ? sourceTrack.getSettings() : {};

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([sourceTrack]);
  playQuietly(video);

  const canvas = makeCanvas(settings.width || 1280, settings.height || 720);
  const ctx = canvas.getContext('2d');

  video.addEventListener('loadedmetadata', () => {
    canvas.width = video.videoWidth || canvas.width;
    canvas.height = video.videoHeight || canvas.height;
  });

  let rafHandle = null;
  function draw(){
    if(video.readyState >= 2){
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
    rafHandle = requestAnimationFrame(draw);
  }
  rafHandle = requestAnimationFrame(draw);

  const canvasStream = canvas.captureStream(30);
  const mirroredTrack = canvasStream.getVideoTracks()[0];

  function stop(){
    if(rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = null;
    try{ mirroredTrack.stop(); }catch{}
    video.srcObject = null;
  }
  // Исходный трек остановлен снаружи (смена камеры, hangup) - глушим цикл рисования, а не рисуем застывший кадр.
  sourceTrack.addEventListener('ended', stop);

  return { track: mirroredTrack, stop };
}
