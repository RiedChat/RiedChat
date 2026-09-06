// =============== ui/chat-view/video-poster/seek.js ===============
// Перемотка зонда к нужной позиции.

export function seekTo(probe, t, onDone){
  const onSeeked = () => {
    probe.removeEventListener('seeked', onSeeked);
    onDone();
  };
  probe.addEventListener('seeked', onSeeked);
  try{ probe.currentTime = t; }
  catch(e){ probe.removeEventListener('seeked', onSeeked); onDone(); }
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
  const proceed = () => { try{ probe.pause(); }catch(e){} seekTo(probe, t, onDone); };
  const playPromise = probe.play();
  if(playPromise && typeof playPromise.then === 'function'){
    playPromise.then(proceed).catch(proceed);
  } else {
    proceed();
  }
}
