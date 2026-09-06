// =============== ui/chat-view/video-poster/probe.js ===============
// Создание и жизненный цикл "зонда" - второго, никогда не показываемого
// <video> с тем же blob-URL, - на котором происходит вся перемотка/захват
// кадра, чтобы видимый пользователю videoEl вообще не трогать.

// Создаёт невидимый (но не off-screen - часть браузеров приостанавливает
// декодирование кадров у видео за пределами вьюпорта) зонд и возвращает
// его вместе с идемпотентной функцией cleanup().
export function createProbe(src){
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
    try{ probe.pause(); }catch(e){}
    probe.removeAttribute('src');
    try{ probe.load(); }catch(e){}
    probe.remove();
  };
  // Подстраховка: если что-то из событий так и не сработает (странный файл,
  // специфика конкретного браузера), зонд не должен висеть в DOM вечно -
  // просто тихо убираем его через несколько секунд.
  const safetyTimer = setTimeout(cleanup, 8000);

  return { probe, cleanup };
}
