// =============== ui/chat-view/video-poster/index.js ===============
// Ставит <video> постер (кадр-превью). Выделено из ui/chat-view.js:
// самодостаточный блок, не зависящий от остального рендера сообщений -
// только от DOM API и debugLog.
import { createProbe } from './probe.js';
import { seekTo, primeThenSeek } from './seek.js';
import { captureFrame } from './capture.js';
import { createLruMap } from '../../../core/lru-map.js';

// Кэш уже захваченного постера (dataURL) по blobUrl видео. render-messages.js
// пересобирает список сообщений на каждое новое событие в чате и заново
// вызывает setPreviewPoster() для видео без встроенного превью (старые
// сообщения / другие клиенты) - хотя кадр для этого же blobUrl уже был
// честно захвачен зондом минуту назад. Без кэша - новый невидимый
// <video>-зонд, добавление в document.body, перемотка, canvas.toDataURL()
// на КАЖДУЮ перерисовку чата для КАЖДОГО такого видео. Ключ - src (blobUrl),
// он стабилен для одного и того же вложения между рендерами (см. тот же
// довод в voice-player/mount.js:_prepared).
// Без верхней границы этот кэш рос бы всю сессию вкладки без освобождения -
// при активном использовании (десятки/сотни видео за долгую сессию) это
// ощутимая утечка памяти под base64-строки постеров, которые никогда не
// освобождались бы. См. core/lru-map.js.
const _posterCache = createLruMap(200); // blobUrl -> dataURL

// Ставит <video> постер (кадр-превью, видимый до нажатия Play) - кадром из
// СЕРЕДИНЫ ролика (обычно куда информативнее, чем первый кадр, который у
// многих видео чёрный/пустой).
//
// Вся перемотка идёт на ОТДЕЛЬНОМ, никогда не показываемом "зонде" (см.
// probe.js) - втором <video> с тем же blob-URL, - чтобы показываемый
// пользователю videoEl вообще не трогать (никакого видимого скачка на
// экране).
//
// ВАЖНО: у части видео (особенно webm/blob-URL, но иногда и mp4) сразу после
// loadedmetadata duration равен Infinity/NaN, а не реальной длительности -
// это известная особенность MediaSource/blob-плеера без индекса в контейнере.
// Раньше в этом случае функция просто сдавалась (return без захвата кадра),
// и постер оставался пустым/серым НАВСЕГДА. Теперь при Infinity/NaN сперва
// перематываем далеко вперёд - это заставляет браузер посчитать реальную
// длительность (событие durationchange/seeked) - и уже от неё берём середину.
// Если и это не помогает, всё равно захватываем хоть какой-то декодированный
// кадр, а не оставляем пустой прямоугольник.
//
// opts.skipSeek - не пытаться перематывать зонд вообще, а хватать кадр сразу
// после короткого play()/pause(). Нужен для кружков (features/video-note.js):
// это всегда webm ИЗ MediaRecorder БЕЗ индекса/cues в контейнере - на таких
// файлах currentTime вообще не работает (браузер молча игнорирует перемотку,
// 'seeked' не срабатывает даже с уже используемым выше трюком "перемотать
// далеко вперёд"), и без skipSeek постер у кружков просто никогда не
// появлялся - зонд молча висел до 8-секундного safetyTimer и снимался без
// кадра. Для обычных видео (файлы с нормальным индексом) поведение не
// меняется - там перемотка к середине по-прежнему работает и даёт более
// информативный кадр, чем случайный первый.
export function setPreviewPoster(videoEl, opts){
  const skipSeek = !!(opts && opts.skipSeek);
  const src = videoEl.currentSrc || videoEl.src;
  if(!src) return;

  const cached = _posterCache.get(src);
  if(cached){
    videoEl.poster = cached;
    _posterCache.touch(src); // переставляем в конец LRU-очереди
    return;
  }

  const { probe, cleanup } = createProbe(src);
  // Оборачиваем cleanup: сохраняем в кэш то, что captureFrame успел записать
  // в videoEl.poster (dataURL), ДО того как зонд уничтожается. Если кадр
  // захватить не удалось (videoEl.poster остался пуст), в кэш ничего не
  // кладём - следующий рендер честно попробует захватить ещё раз, а не
  // навсегда застрянет с пустым превью.
  const cleanupAndCache = () => {
    if(videoEl.poster) _posterCache.set(src, videoEl.poster);
    cleanup();
  };
  const capture = () => captureFrame(probe, videoEl, cleanupAndCache);

  probe.addEventListener('error', cleanupAndCache);
  // 'canplay' (не 'loadedmetadata'!) - на loadedmetadata браузер знает только
  // размеры/длительность, но ещё не декодировал достаточно данных, чтобы
  // гарантированно отдать реальный кадр на произвольном currentTime; на части
  // видео (особенно webm) это и давало пустой/серый постер.
  probe.addEventListener('canplay', () => {
    if(skipSeek){
      // Без перемотки: короткий play() уже прогревает декодер и продвигает
      // плейбек на пару кадров вперёд от самого начала (обычно не чёрного) -
      // сразу после паузы хватаем то, что уже декодировано.
      // pause() сразу после play() иногда бросает на гонке с промисом play() -
      // не критично, capture() ниже снимает кадр независимо от исхода pause().
      const proceed = () => { try{ probe.pause(); }catch(e){} capture(); };
      const playPromise = probe.play();
      if(playPromise && typeof playPromise.then === 'function'){
        playPromise.then(proceed).catch(proceed);
      } else {
        proceed();
      }
      return;
    }
    const duration = probe.duration;
    if(isFinite(duration) && duration > 0){
      primeThenSeek(probe, duration / 2, capture);
      return;
    }
    // Duration неизвестна сразу - перематываем далеко вперёд, чтобы браузер
    // пересчитал реальную длительность, затем встаём на середину от неё.
    primeThenSeek(probe, 1e7, () => {
      const real = probe.duration;
      if(isFinite(real) && real > 0){
        seekTo(probe, real / 2, capture);
      } else {
        capture(); // сдаёмся с duration - берём кадр как есть, лишь бы не пусто
      }
    });
  }, {once: true});
}
