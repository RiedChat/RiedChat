// =============== ui/chat-view/video-poster/probe.js ===============
// Жизненный цикл «зонда» - невидимого <video> с тем же blob-URL, на котором идёт перемотка/захват, чтобы не трогать видимый videoEl.

// Невидимый, но не off-screen (часть браузеров не декодирует видео вне вьюпорта) зонд; возвращает его и идемпотентный cleanup().
//
// onSafetyTimeout вызывается вместо cleanup(), если обычный путь (canplay -> seeked/decoded frame -> capture) не уложился в 8с: это последняя попытка захвата (index.js). Раньше зонд просто исчезал, _posterCache не заполнялся, и следующий рендер повторял те же 8с. Без onSafetyTimeout - cleanup().
export function createProbe(src, onSafetyTimeout){
  const probe = document.createElement('video');
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = 'auto';
  probe.style.cssText = 'position:absolute;top:0;left:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(probe);
  probe.src = src;

  let done = false;
  const cleanup = () => {
    if(done) return;
    done = true;
    clearTimeout(safetyTimer);
    // Зонд сразу удаляется из DOM: load() в этот момент в некоторых браузерах бросает; ошибку игнорируем.
    probe.pause();
    probe.removeAttribute('src');
    try{ probe.load(); }catch{}
    probe.remove();
  };
  // Страховка: зонд не должен висеть в DOM вечно. Если done ещё false - обычный путь не отработал за 8с, даём последний шанс захватить кадр (onSafetyTimeout).
  const safetyTimer = setTimeout(() => {
    if(done) return;
    if(onSafetyTimeout) onSafetyTimeout();
    else cleanup();
  }, 8000);

  return { probe, cleanup };
}
