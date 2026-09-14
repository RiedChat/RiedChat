// =============== ui/chat-view/video-poster/seek.js ===============
// Перемотка зонда к нужной позиции.

export function seekTo(probe, t, onDone){
  // Подстраховка: на части файлов (некоторые webm/blob-URL без индекса
  // ключевых кадров в контейнере, обычно замеченное у видео-кружков, но не
  // исключено и у обычных видео) currentTime молча игнорируется браузером -
  // 'seeked' не срабатывает НИКОГДА, а не просто с задержкой. Без таймаута
  // здесь onDone не вызывался бы вовсе - до самой безопасной 8-секундной
  // очистки зонда в probe.js, которая раньше просто удаляла зонд, ничего не
  // захватив (см. её же fallback-колбэк, добавленный вместе с этим фиксом).
  // 900ms с запасом покрывает нормальную перемотку (обычно десятки мс) и
  // не даёт застрявшему файлу тянуть время до общего 8-секундного предела.
  let settled = false;
  const finish = () => {
    if(settled) return;
    settled = true;
    clearTimeout(timeoutId);
    probe.removeEventListener('seeked', onSeeked);
    onDone();
  };
  const onSeeked = finish;
  const timeoutId = setTimeout(finish, 900);
  probe.addEventListener('seeked', onSeeked);
  try{ probe.currentTime = t; }
  catch(_e){ finish(); }
}

// На части браузеров (в первую очередь Safari/iOS) drawImage() из <video>,
// который ни разу не проигрывался, отдаёт чёрный/пустой кадр даже после
// "правильного" seeked - декодер там прогревается только реальным
// воспроизведением. Поэтому перед перемоткой коротко запускаем и сразу же
// ставим на паузу сам плейбек - это ничего не показывает пользователю
// (зонд и так невидим), но прогревает пайплайн декодирования.
export function primeThenSeek(probe, t, onDone){
  // pause() тут же после play() иногда бросает (гонка с ещё не осевшим
  // play-промисом в части браузеров) - не критично, дальше всё равно сразу
  // вызываем seekTo(), а пауза к этому моменту нужна лишь превентивно.
  const proceed = () => { try{ probe.pause(); }catch(_e){} seekTo(probe, t, onDone); };
  const playPromise = probe.play();
  if(playPromise && typeof playPromise.then === 'function'){
    playPromise.then(proceed).catch(proceed);
  } else {
    proceed();
  }
}
