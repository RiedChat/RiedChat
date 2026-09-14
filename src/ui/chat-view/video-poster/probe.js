// =============== ui/chat-view/video-poster/probe.js ===============
// Создание и жизненный цикл "зонда" - второго, никогда не показываемого
// <video> с тем же blob-URL, - на котором происходит вся перемотка/захват
// кадра, чтобы видимый пользователю videoEl вообще не трогать.

// Создаёт невидимый (но не off-screen - часть браузеров приостанавливает
// декодирование кадров у видео за пределами вьюпорта) зонд и возвращает
// его вместе с идемпотентной функцией cleanup().
//
// onSafetyTimeout - вызывается ВМЕСТО немедленного cleanup(), если обычный
// путь (canplay -> seeked/decoded frame -> capture) не завершился за 8с
// (см. index.js: там это последняя попытка честно захватить кадр, а не
// прямое удаление зонда). Раньше таймер сам звал cleanup() напрямую - зонд
// тихо исчезал БЕЗ единой попытки захвата, превью навсегда оставалось
// пустым, а _posterCache ничего не кэшировал (кэшируется только успешный
// poster) - следующий рендер того же видео повторял те же обречённые 8с
// заново. Если onSafetyTimeout не передан, поведение как раньше (cleanup()).
export function createProbe(src, onSafetyTimeout){
  const probe = document.createElement('video');
  probe.muted = true;
  probe.playsInline = true;
  probe.preload = 'auto';
  probe.style.position = 'absolute';
  probe.style.top = '0';
  probe.style.left = '0';
  probe.style.width = '2px';
  probe.style.height = '2px';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  probe.src = src;

  let done = false;
  const cleanup = () => {
    if(done) return;
    done = true;
    clearTimeout(safetyTimer);
    // Элемент сейчас же удаляется из DOM (probe.remove() ниже) - pause()/
    // load() на нём в этот момент иногда бросают в отдельных браузерах;
    // раз зонд всё равно уничтожается, ошибку игнорируем.
    try{ probe.pause(); }catch(_e){}
    probe.removeAttribute('src');
    try{ probe.load(); }catch(_e){}
    probe.remove();
  };
  // Подстраховка: если что-то из событий так и не сработает (странный файл,
  // специфика конкретного браузера), зонд не должен висеть в DOM вечно.
  // done ещё не true - значит обычный путь захвата за 8с не отработал;
  // даём вызывающему коду последний шанс захватить хоть какой-то кадр
  // (см. onSafetyTimeout выше) вместо того, чтобы просто исчезнуть.
  const safetyTimer = setTimeout(() => {
    if(done) return;
    if(onSafetyTimeout) onSafetyTimeout();
    else cleanup();
  }, 8000);

  return { probe, cleanup };
}
