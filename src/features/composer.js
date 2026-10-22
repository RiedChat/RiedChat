// ===================== features/composer.js =====================
// Поле ввода: авто-высота textarea, переключение микрофон/отправка (как в Telegram), отправка по клику/Enter.
import { $, isNearBottom, scrollToBottom, keepFocus } from '../core/dom-utils.js';
import { sendCurrentMessage } from '../net/messaging/outgoing/compose.js';

export function wireComposer(){
    const input = $('msg-input');
    const updateComposerButtons = () => {
      const hasText = input.value.trim() !== '';
      $('mic-btn').hidden = hasText;
      $('send-btn').hidden = !hasText;
    };
    updateComposerButtons();

    // Клик по <button> переносит фокус на кнопку, и мобильный браузер закрывает клавиатуру после каждой отправки.
    // preventDefault() на mousedown отменяет перенос фокуса, click при этом срабатывает.
    keepFocus($('send-btn'));
    keepFocus($('mic-btn'));

    const send = () => {
      sendCurrentMessage();
      updateComposerButtons();
      // Подстраховка для старых WebView без поддержки preventDefault на mousedown (см. keepFocus выше): возвращаем фокус в поле.
      input.focus();
    };

    $('send-btn').addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if(e.key !== 'Enter' || e.shiftKey) return;
      // На телефоне Enter переносит строку, а не отправляет - не вмешиваемся.
      if(window.matchMedia('(pointer: coarse)').matches) return;
      e.preventDefault();
      send();
    });
    input.addEventListener('input', () => {
      // Когда textarea растёт, #messages уменьшается, а scrollTop не меняется - последние сообщения уезжают за нижний край.
      // Запоминаем ДО смены высоты, был ли пользователь внизу, и если да - прижимаем к низу ПОСЛЕ. Если он листал вверх - не мешаем.
      const messagesEl = $('messages');
      // Допуск isNearBottom 48px (не 4px): запас на субпиксельное округление и инерционный скролл; узкий допуск ломал автоскролл после первой же новой строки.
      const wasNearBottom = messagesEl && isNearBottom(messagesEl);

      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      updateComposerButtons();

      if(messagesEl && wasNearBottom) scrollToBottom(messagesEl);
    });
}
