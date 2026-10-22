// ===================== net/upload/video-thumb.js =====================
// Превью-кадр ОБЫЧНОГО видео-вложения (из галереи/файловой системы, features/file-upload.js): один раз
// на стороне отправителя из незашифрованного оригинала File; встраивание в ссылку - net/media/thumb-codec.js.
//
// Как и у кружков (features/video-note/recording-stop.js): без перемотки/currentTime и индекса контейнера (Cues).
// Перемотка зонда к середине (seekTo/'seeked') зависит от того, как браузер трактует currentTime по индексу
// файла - ровно то, чего нет у webm без индекса (ui/chat-view/video-poster/index.js). У кружков кадр берётся
// с канваса живой записи; здесь канваса нет, поэтому ждём, пока браузер РЕАЛЬНО декодирует и доставит кадр
// (onDecodedFrame/requestVideoFrameCallback) - без допущений о currentTime/Cues/длительности.
import { createProbe } from '../../ui/chat-view/video-poster/probe.js';
import { encodeThumbFromSource } from '../media/thumb-codec.js';

const THUMB_MAX_DIM = 320;

// Ждёт, пока браузер реально декодирует и доставит хотя бы один кадр, и только тогда его читать.
// Запасной способ - двойной requestAnimationFrame.
const doubleRaf = fn => requestAnimationFrame(() => requestAnimationFrame(fn));

// requestVideoFrameCallback вызывается после того, как кадр дошёл до композитора (точнее, чем 'seeked' и голый rAF). Где не поддерживается - двойной rAF.
function onDecodedFrame(videoEl, cb){
  if(typeof videoEl.requestVideoFrameCallback === 'function'){
    // Страховка: на видео, которое браузер не смог проиграть (webm без индекса, см. seek.js), rVFC может не вызваться никогда. Тот же двойной rAF по таймеру не даёт cb() ждать до 8-секундного предела зонда; безопасен и без нового кадра - drawImage() прочитает текущий.
    let done = false;
    const finish = () => { if(done) return; done = true; cb(); };
    videoEl.requestVideoFrameCallback(finish);
    setTimeout(() => doubleRaf(finish), 1000);
  } else {
    doubleRaf(cb);
  }
}

// Подстраховка независимо от safety-таймера зонда (createProbe чистит DOM через 8с, но промис не резолвит):
// на случай, если не придут ни 'canplay', ни декодированный кадр.
const GUARD_MS = 6000;

export function captureVideoThumb(file){
  return new Promise((resolve) => {
    let src;
    try{ src = URL.createObjectURL(file); }
    catch{ resolve(null); return; }

    const { probe, cleanup } = createProbe(src);
    let settled = false;
    const finish = (result) => {
      if(settled) return;
      settled = true;
      clearTimeout(guardTimer);
      cleanup();
      try{ URL.revokeObjectURL(src); }catch{}
      resolve(result);
    };
    const guardTimer = setTimeout(() => finish(null), GUARD_MS);

    probe.addEventListener('error', () => finish(null));
    probe.addEventListener('canplay', () => {
      // play() нужен, чтобы декодер начал отдавать кадры: на не проигрывавшемся <video> drawImage()
      // в части браузеров (Safari/iOS) даёт чёрный кадр даже после canplay. Кадр - из начала ролика;
      // цена отказа от seek, зато нет чёрного кадра и зависания на 'seeked', который у некоторых файлов не приходит.
      const grab = () => {
        probe.pause();
        finish(encodeThumbFromSource(probe, THUMB_MAX_DIM));
      };
      const onReady = () => onDecodedFrame(probe, grab);
      Promise.resolve(probe.play()).then(onReady, onReady);
    }, {once: true});
  });
}
