// ===================== features/call/mirror-track.js =====================
// Зеркалит исходящий видеотрек по горизонтали через canvas.captureStream().
// CSS-класс .mirrored в call.css разворачивает только локальное превью -
// на то, что реально уходит по RTCPeerConnection, он не влияет, поэтому
// собеседник видел движения зеркально перевёрнутыми относительно того, что
// пользователь видит у себя (повернул голову влево на своём экране -
// собеседник видит поворот вправо). Этот модуль зеркалит сам исходящий
// трек, рисуя кадры с камеры в скрытый canvas с scale(-1,1) и отдавая
// видеотрек с этого canvas вместо исходного трека камеры.
export function createMirroredVideoTrack(sourceTrack){
  const settings = sourceTrack.getSettings ? sourceTrack.getSettings() : {};

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([sourceTrack]);
  video.play().catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = settings.width || 1280;
  canvas.height = settings.height || 720;
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
    try{ mirroredTrack.stop(); }catch(e){}
    video.srcObject = null;
  }
  // Если исходный трек камеры остановлен снаружи (смена камеры, hangup) -
  // глушим цикл рисования вместе с ним, а не рисуем застывший кадр вхолостую.
  sourceTrack.addEventListener('ended', stop);

  return { track: mirroredTrack, stop };
}
