// ===================== features/composer.js =====================
// Поле ввода сообщения: авто-высота textarea, переключение микрофон/отправка
// (как в Telegram), отправка по клику/Enter.
import { $ } from '../core/dom-utils.js';
import { sendCurrentMessage } from '../net/messaging/outgoing.js';

export function wireComposer(){
    function updateComposerButtons(){
      const hasText = $('msg-input').value.trim().length > 0;
      $('mic-btn').style.display = hasText ? 'none' : 'flex';
      $('send-btn').style.display = hasText ? 'flex' : 'none';
    }
    updateComposerButtons();

    // ВАЖНО: клик по <button> по умолчанию переносит фокус на саму кнопку -
    // textarea теряет фокус, и мобильный браузер закрывает экранную
    // клавиатуру после каждой отправки (заметно на телефоне, на десктопе
    // незаметно, т.к. там нет виртуальной клавиатуры). preventDefault() на
    // mousedown отменяет именно это "перетягивание" фокуса, но не мешает
    // самому click сработать чуть позже (на mouseup) - отправка работает
    // как прежде, просто фокус остаётся в поле ввода.
    $('send-btn').addEventListener('mousedown', (e) => e.preventDefault());
    $('mic-btn').addEventListener('mousedown', (e) => e.preventDefault());

    $('send-btn').addEventListener('click', () => {
      sendCurrentMessage();
      updateComposerButtons();
      // На случай, если фокус всё же успел куда-то уйти (например, старый
      // WebView без корректной поддержки preventDefault на mousedown) -
      // подстраховочно возвращаем его на поле ввода, чтобы клавиатура не
      // закрывалась и можно было сразу печатать следующее сообщение.
      $('msg-input').focus();
    });
    $('msg-input').addEventListener('keydown', (e) => {
      if(e.key !== 'Enter' || e.shiftKey) return;
      // На телефоне (сенсорная клавиатура) стрелка/Enter должна переносить строку, а не отправлять -
      // просто не вмешиваемся, и textarea сама вставит перенос строки, как обычно.
      const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if(coarsePointer) return;
      e.preventDefault();
      sendCurrentMessage();
      updateComposerButtons();
    });
    $('msg-input').addEventListener('input', function(){
      // ВАЖНО: когда textarea растёт (многострочный ввод), контейнер #messages
      // физически уменьшается в высоте (уступает место полю ввода) - но его
      // scrollTop браузер при этом не трогает. Раз контейнер стал ниже, а
      // scrollTop тот же, последние сообщения "уезжают" за нижний край -
      // визуально выглядит как "проскроллило вверх", хотя на самом деле
      // просто сократилась видимая область. Запоминаем ДО изменения высоты,
      // был ли пользователь у самого низа (с небольшим допуском на
      // погрешность округления), и если да - допинываем обратно к низу ПОСЛЕ
      // изменения. Если пользователь специально прокрутил историю вверх -
      // не мешаем, автоскролл в этом случае не срабатывает.
      const messagesEl = $('messages');
      // 48px (не 4px) - с запасом на субпиксельное округление высоты строки/
      // инерционный скролл на мобильных: слишком узкий допуск раньше приводил
      // к тому, что автоскролл переставал срабатывать уже после первой же
      // подрощенной строки текста, и при печати многострочного сообщения
      // список визуально "уезжал" вверх с каждой следующей строкой, вместо
      // того чтобы оставаться прижатым к низу.
      const NEAR_BOTTOM_PX = 48;
      const wasNearBottom = messagesEl &&
        (messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight) <= NEAR_BOTTOM_PX;

      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 140) + 'px';
      updateComposerButtons();

      if(messagesEl && wasNearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}
