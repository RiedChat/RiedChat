// ===================== features/viewport.js =====================
// Держит высоту #app в синхроне с РЕАЛЬНО видимой частью экрана на мобильных
// устройствах и допинывает список сообщений обратно вниз, когда экранная
// клавиатура открывается/закрывается.
//
// ПРОБЛЕМА: у #app было `height:100vh` (см. css/sidebar.css). На мобильных
// браузерах при открытии клавиатуры layout viewport (от которого считается
// vh) чаще всего НЕ уменьшается - клавиатура просто перекрывает собой низ
// страницы. #messages при этом честно скроллится в свой scrollHeight (низ
// СПИСКА), но этот низ физически скрыт под клавиатурой - на экране виден
// более ранний участок переписки, будто новое сообщение "осталось выше",
// а не внизу.
//
// РЕШЕНИЕ: 100dvh в CSS уже чинит это в большинстве современных браузеров.
// Здесь - JS-фолбэк через window.visualViewport (шире поддержан, есть и в
// старых WebView без dvh) плюс главное: при каждом изменении видимой высоты
// (открыли/закрыли клавиатуру) - если пользователь и так был внизу списка -
// снова прижимаем #messages к низу, чтобы последнее сообщение гарантированно
// оказалось видно над клавиатурой, а не под ней.
import { $ } from '../core/dom-utils.js';
import { throttle } from '../core/timing.js';

export function wireViewport(){
  const vv = window.visualViewport;

  function applyHeight(){
    // Высота реально видимой области - от visualViewport, если браузер его
    // поддерживает (учитывает клавиатуру), иначе просто innerHeight.
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', h + 'px');
  }

  function isNearBottom(el, tolerancePx){
    return (el.scrollHeight - el.scrollTop - el.clientHeight) <= tolerancePx;
  }

  let wasNearBottomBeforeResize = true;

  function handleResize(){
    const messagesEl = $('messages');
    // Запоминаем ДО изменения высоты - как и в features/composer.js:
    // после applyHeight() #messages физически станет ниже (клавиатура
    // открылась) или выше (закрылась), и тот же scrollTop уже не будет
    // означать "внизу".
    if(messagesEl) wasNearBottomBeforeResize = isNearBottom(messagesEl, 48);

    applyHeight();

    // Даём браузеру один кадр на реальный реflow под новую высоту, и только
    // потом поджимаем к низу - если делать это в тот же тик, scrollHeight
    // ещё может быть посчитан по старой высоте контейнера.
    requestAnimationFrame(() => {
      if(messagesEl && wasNearBottomBeforeResize){
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }

  applyHeight();

  // visualViewport на iOS шлёт 'scroll' на каждый кадр анимации клавиатуры
  // (десятки событий за долю секунды) - без throttle handleResize гонял бы
  // scrollHeight/reflow на каждый такой кадр. 32мс (два кадра) достаточно,
  // чтобы не быть заметным глазу, но заметно снизить нагрузку; trailing-вызов
  // throttle гарантирует, что финальное положение клавиатуры всё равно
  // обработается, даже если события перестали сыпаться внутри окна throttle.
  const throttledResize = throttle(handleResize, 32);

  if(vv){
    vv.addEventListener('resize', throttledResize);
    // На iOS открытие клавиатуры иногда даёт ТОЛЬКО scroll-событие
    // visualViewport (без resize), если страница при этом не меняла layout.
    vv.addEventListener('scroll', throttledResize);
  } else {
    // Совсем старые браузеры без visualViewport - хотя бы обычный resize
    // (сработает не для всех клавиатур, но лучше, чем ничего).
    window.addEventListener('resize', throttledResize);
  }
}
