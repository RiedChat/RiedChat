// ===================== features/viewport.js =====================
// Синхронизирует высоту #app с реально видимой областью на мобильных и прижимает список сообщений к низу при открытии/закрытии клавиатуры.
//
// Проблема: при height:100vh (css/sidebar.css) клавиатура не уменьшает layout viewport, а перекрывает низ страницы;
// #messages скроллится в свой низ, но тот скрыт под клавиатурой.
// Решение: 100dvh в CSS чинит большинство браузеров; здесь JS-фолбэк через visualViewport (есть в старых WebView без dvh)
// и при смене видимой высоты, если пользователь был внизу, снова прижимаем #messages к низу.
import { $, isNearBottom, scrollToBottom } from '../core/dom-utils.js';

export function wireViewport(){
  const vv = window.visualViewport;

  // Видимая высота: visualViewport (учитывает клавиатуру), иначе innerHeight.
  const applyHeight = () =>
    document.documentElement.style.setProperty('--app-vh', (vv?.height ?? window.innerHeight) + 'px');

  applyHeight();

  // iOS шлёт visualViewport "scroll" на каждый кадр анимации клавиатуры; обработка раз в кадр (requestAnimationFrame) снижает нагрузку,
  // последний вызов в кадре гарантирует обработку финального положения.
  let rafId = 0;
  const onResize = () => {
    rafId ||= requestAnimationFrame(() => {
      rafId = 0;
      const el = $('messages');
      // Запоминаем ДО смены высоты (как в composer.js, через core/dom-utils.js:isNearBottom): после applyHeight() прежний scrollTop уже не означает "внизу".
      const stick = el && isNearBottom(el);
      applyHeight();
      // Ждём один кадр на reflow, затем прижимаем к низу: в тот же тик scrollHeight может быть по старой высоте.
      if(stick) requestAnimationFrame(() => scrollToBottom(el));
    });
  };

  // Без visualViewport - обычный resize окна (не для всех клавиатур, но лучше чем ничего).
  (vv ?? window).addEventListener('resize', onResize);
  // На iOS клавиатура иногда даёт только "scroll" visualViewport без "resize".
  vv?.addEventListener('scroll', onResize);
}
