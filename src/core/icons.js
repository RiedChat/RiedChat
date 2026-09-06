// ===================== core/icons.js =====================
// Инлайновые SVG-иконки, которые собираются в разметку динамически из JS
// (в отличие от большинства иконок, вставленных статически прямо в
// index.html). Сейчас это только замки статуса OMEMO - индикатор
// шифрования у сообщений (ui/chat-view/render-messages.js), бейдж и
// переключатель в шапке чата (ui/chat-head.js, features/chat-controls.js).
// Path-данные живут в одном месте - public/icons/sprite.svg - и сюда, и в
// index.html подключаются через <use href="#id">, а не
// копипастой <path>: правка иконки теперь не требует искать её по всему
// проекту. stroke="currentColor" на обёртке - иконка красится текущим
// цветом текста родителя (см. .icon-svg в css/base.css), <use> наследует
// его от обёртки как обычный потомок.
export const ICON_LOCK_CLOSED = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg"><use href="#lock-closed" xlink:href="#lock-closed"></use></svg>';

export const ICON_LOCK_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg"><use href="#lock-open" xlink:href="#lock-open"></use></svg>';

// Одна галочка "check" (Heroicons outline). Готовой "двойной" галочки в
// наборе нет, поэтому "прочитано" рисуется ДВУМЯ такими иконками подряд со
// сдвигом внахлёст (см. .ticks.read в css/messages.css) - как в Telegram.
export const ICON_CHECK = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" class="icon-svg"><use href="#check" xlink:href="#check"></use></svg>';
