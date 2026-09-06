// ===================== net/upload/video-thumb.js =====================
// Генерация превью-кадра для ОБЫЧНОГО видео-вложения (выбранного из
// файловой системы/галереи, features/file-upload.js), ОДИН РАЗ на стороне
// отправителя, из ещё не зашифрованного и не загруженного на сервер
// оригинального File - см. net/media/thumb-codec.js о том, как это потом
// встраивается в саму ссылку.
//
// ТЕМ ЖЕ ПРИНЦИПОМ, ЧТО И У КРУЖКОВ (features/video-note/recording-stop.js):
// никакой перемотки/currentTime и никакой зависимости от индекса кадров
// контейнера (Cues) - раньше здесь была перемотка зонда к середине
// (seekTo/'seeked'), а это ровно тот же класс костыля, что и постфактумный
// захват кадра из webm без индекса (см. ui/chat-view/video-poster/index.js):
// формально для файлов с нормальным контейнером перемотка почти всегда
// срабатывает, но полагается на то, что браузер правильно интерпретирует
// currentTime по индексу конкретного файла - т.е. на то же самое свойство
// контейнера, которого у кружков как раз и нет. Кружки эту проблему решают
// вообще без похода в готовый файл (кадр берётся прямо с канваса живой
// записи) - здесь готового "канваса" нет, но можно взять максимально
// близкий по духу приём: просто дождаться, что браузер РЕАЛЬНО декодировал
// и доставил хотя бы один кадр (см. onDecodedFrame/requestVideoFrameCallback),
// без каких-либо предположений о currentTime/Cues/длительности вообще.
import { createProbe } from '../../ui/chat-view/video-poster/probe.js';
import { onDecodedFrame } from '../../ui/chat-view/video-poster/decoded-frame.js';
import { encodeThumbFromSource } from '../media/thumb-codec.js';

const THUMB_MAX_DIM = 320;
// Подстраховка НЕЗАВИСИМО от внутреннего safety-таймера зонда
// (createProbe чистит DOM-элемент сам через 8с, но не резолвит наш
// промис) - на случай если ни 'canplay', ни декодированный кадр так и не придут.
const GUARD_MS = 6000;

export function captureVideoThumb(file){
  return new Promise((resolve) => {
    let src;
    try{ src = URL.createObjectURL(file); }
    catch(e){ resolve(null); return; }

    const { probe, cleanup } = createProbe(src);
    let settled = false;
    const finish = (result) => {
      if(settled) return;
      settled = true;
      clearTimeout(guardTimer);
      cleanup();
      try{ URL.revokeObjectURL(src); }catch(e){}
      resolve(result);
    };
    const guardTimer = setTimeout(() => finish(null), GUARD_MS);

    probe.addEventListener('error', () => finish(null));
    probe.addEventListener('canplay', () => {
      // play() перед захватом нужен, чтобы декодер вообще начал что-то
      // отдавать - на <video>, который ни разу не проигрывался, drawImage()
      // на части браузеров (Safari/iOS) отдаёт чёрный кадр даже после
      // canplay. Кадр будет из самого начала ролика (а не из середины, как
      // при перемотке раньше) - цена честного отказа от seek, зато без
      // риска молча получить пустой/чёрный кадр или зависнуть в ожидании
      // 'seeked', который на некоторых файлах не приходит вовсе.
      const grab = () => {
        try{ probe.pause(); }catch(e){}
        finish(encodeThumbFromSource(probe, THUMB_MAX_DIM));
      };
      const onReady = () => onDecodedFrame(probe, grab);
      const playPromise = probe.play();
      if(playPromise && typeof playPromise.then === 'function'){
        playPromise.then(onReady).catch(onReady);
      } else {
        onReady();
      }
    }, {once: true});
  });
}
