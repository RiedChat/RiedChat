// ===================== core/icons.js =====================
// Инлайновые SVG-иконки, собираемые из JS (замки статуса OMEMO: ui/chat-view/render-messages.js, ui/chat-head.js,
// features/chat-controls.js). Path-данные - в public/icons/sprite.svg, подключаются через <use href="#id">.
// stroke="currentColor" красит иконку цветом текста родителя (.icon-svg в css/base.css).
// Иконка из спрайта по id (#photo, #paper-clip, ...); extraClass - доп. класс. Возвращает строку: внутри html`...` оборачивать в raw().
export const icon = (id, extraClass = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg${extraClass ? ' ' + extraClass : ''}"><use href="#${id}"></use></svg>`;

export const ICON_LOCK_CLOSED = icon('lock-closed');
export const ICON_LOCK_OPEN = icon('lock-open');
// Одна галочка (Heroicons outline); "прочитано" - две со сдвигом внахлёст (.ticks.read в css/messages.css).
export const ICON_CHECK = icon('check');
