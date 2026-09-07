// ===================== ui/chat-view/render-messages.js =====================
// Рендер списка сообщений чата (включая инлайн-медиа, цитаты, галочки).
// Разбор "что за медиа в теле" и HTML цитаты/инлайн-медиа - в chat-view/
// message-body-html.js. Рендереры по типу пузыря - в chat-view/
// bubble-renderers.js. Здесь остаётся только тонкий цикл renderMessages(),
// разбитый на chronologicalWithDayDividers/findFirstUnreadIndex/
// renderMessageRow, которые вставляют готовую разметку в DOM и запускают
// догрузку медиа.
import { $, relativeDayLabel } from '../../core/dom-utils.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { ticksHtml, renderBubble } from './bubble-renderers.js';
import { classifySingleMedia } from './message-body-html.js';
import { _watchUnreadDivider, _stopUnreadTracking } from './unread-tracking.js';
import { loadEncryptedMedia, loadPlainImage, _loadQuoteThumbOrDefer, _loadMediaOrDeferForVideo } from './media-loader.js';
import { t } from '../../i18n/t.js';
import { ICON_LOCK_CLOSED, ICON_LOCK_OPEN } from '../../core/icons.js';

const S = state;

// Колбэк, вызываемый в конце каждого renderMessages() - используется
// features/message-select.js, чтобы после перерисовки (например, из-за
// нового входящего сообщения) вернуть класс 'selected' на строки, уже
// отмеченные пользователем, и не потерять режим выбора. Регистрируется
// через onRenderMessages(), а не статическим импортом, чтобы не заводить
// циклическую зависимость render-messages.js <-> message-select.js.
let _afterRender = null;
export function onRenderMessages(cb){ _afterRender = cb; }

  // Сообщения в S.messages должны накапливаться хронологично (push при
  // получении/отправке), но история на диске могла быть один раз записана
  // не по порядку (например, старой версией клиента или частичным сбоем
  // сохранения) - тогда разделители дней ниже расставлялись бы неверно
  // (напр. только один в самом начале). Сортировка здесь ничего не стоит
  // (списки чатов небольшие) и гарантирует правильный порядок независимо
  // от того, что реально лежит в IndexedDB.
  function sortedByTime(list){
    return list.slice().sort((a, b) => (a && a.time || 0) - (b && b.time || 0));
  }

  // Первое непрочитанное входящее - перед ним рисуем плашку "Непрочитанные
  // сообщения". Все входящие после него по построению тоже непрочитанные
  // (сообщения хронологичны), поэтому одной точки вставки достаточно.
  function findFirstUnreadIndex(list){
    return list.findIndex(m => m && !m.out && m.read === false);
  }

// Рендерит одну строку сообщения (или строку с ошибкой, если сообщение
// повреждено) и запускает догрузку её медиа. Возвращает true, если это
// была точка первого непрочитанного (для установки unreadDividerEl).
function renderMessageRow(el, m, mIdx, ctx){
  try{
    const time = new Date(m.time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    const lock = m.encrypted ? `<span class="lock" title="OMEMO">${ICON_LOCK_CLOSED}</span>` : `<span class="lock" title="${t('message.notEncrypted')}">${ICON_LOCK_OPEN}</span>`;
    const ticks = ticksHtml(m);
    const bubbleCtx = {lock, time, ticks, nextSeq: ctx.nextSeq};

    const singleMedia = classifySingleMedia(m.body);
    const rendered = renderBubble(m, singleMedia, bubbleCtx);

    const row = document.createElement('div');
    row.className = 'msg-row ' + (m.out ? 'out' : 'in');
    // Индекс в S.messages[activeChat] - по нему свайп-обработчик (features/message-swipe.js)
    // достаёт исходный объект сообщения для цитирования/копирования/скачивания.
    row.dataset.idx = mIdx;
    // rendered.html уже собран через html/escapeHtml внутри
    // bubble-renderers.js/message-body-html.js - здесь просто вставляем
    // готовый безопасный фрагмент, setHTML откажется от сырой строки.
    setHTML(row, raw(rendered.html));
    el.appendChild(row);

    // Чат всегда 1:1 (S.messages ключ - bareJid собеседника), поэтому
    // отправитель конкретного сообщения однозначно определяется его
    // направлением: свои исходящие - myBareJid, входящие - собеседник
    // (сам ключ чата). Нужно для TOFU-доверия upload-хосту отправителя
    // при скачивании чужих aesgcm://-вложений (см. net/media.js/decrypt).
    const senderJid = m.out ? S.myBareJid : S.activeChat;
    rendered.media.forEach(({type, id, url, holdOff, kind, isNote}) => {
      if(type === 'voice') loadEncryptedMedia(id, url, senderJid);
      else if(type === 'plain-image') loadPlainImage(id, url);
      // Карточка "добавить пак стикеров" - редкий тип сообщения, поэтому её
      // код (и вся сборка стикер-фичи, которую тянет pack-card.js) грузится
      // отдельным чанком по требованию, а не для каждого открытия чата.
      else if(type === 'stickerpack') import('../../features/stickers/pack-card.js').then(m => m.loadStickerPackCard(id, url, senderJid));
      // Миниатюра фото/видео/кружка/стикера ВНУТРИ самой цитаты (см.
      // ui/chat-view/message-body-html.js:formatMessageBody) - отдельная,
      // более лёгкая догрузка: только маленькая картинка/кадр, без плеера.
      // holdOff (см. message-body-html.js) - когда автозагрузка выключена,
      // расшифровка запускается только по тапу (плашка "нажмите, чтобы
      // загрузить"), а не сразу при рендере.
      else if(type === 'quote-thumb') _loadQuoteThumbOrDefer(id, url, kind, isNote, senderJid, holdOff);
      else _loadMediaOrDeferForVideo(id, url, holdOff, senderJid);
    });
  }catch(e){
    // Одно повреждённое сообщение (например, body не строка из-за старого
    // сбоя записи) раньше ронял исключение прямо из forEach и обрывал
    // весь renderMessages() на середине - чат просто оставался пустым,
    // без единой подсказки, что случилось. Теперь пропускаем только
    // конкретную битую запись и продолжаем рисовать остальные.
    console.warn('не удалось отрисовать сообщение #' + mIdx + ' в чате ' + S.activeChat, e, m);
    debugLog('[render] сообщение #' + mIdx + ' повреждено и пропущено: ' + (e && e.message ? e.message : e));
    const errRow = document.createElement('div');
    errRow.className = 'msg-row ' + (m && m.out ? 'out' : 'in');
    setHTML(errRow, html`<div class="bubble">⚠️ ${t('message.corrupted')}</div>`);
    el.appendChild(errRow);
  }
}

// Насколько близко к низу нужно быть ДО перерисовки, чтобы посчитать это
// "чат долистан до конца" и автоскроллить вниз при новом сообщении - а не
// точное равенство, чтоб под-пиксельные округления scrollHeight/clientHeight
// в разных браузерах не считались "не долистано".
const AT_BOTTOM_THRESHOLD_PX = 48;

// ---------- MESSAGES ----------
export function renderMessages(){
  const el = $('messages');
  // Снимок положения скролла ДО очистки/перестройки DOM: новые сообщения
  // добавляются только СНИЗУ существующей истории, значит содержимое выше
  // текущей позиции просмотра не меняется - если человек не был внизу, его
  // scrollTop после перерисовки нужно просто оставить как было (чат не
  // должен никуда "прыгать"), а не сбрасывать вниз, как раньше.
  const wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= AT_BOTTOM_THRESHOLD_PX;
  const prevScrollTop = el.scrollTop;
  el.innerHTML = '';
  _stopUnreadTracking(); // старый наблюдатель указывал на удалённый DOM-узел прошлого рендера
  const list = sortedByTime(S.messages[S.activeChat] || []);
  const firstUnreadIdx = findFirstUnreadIndex(list);

  let unreadDividerEl = null;
  let lastDay = null;
  let mediaSeq = 0; // монотонный счётчик на весь рендер - безопасен для id, в отличие от произвольной m.id (у MAM-сообщений это строка от сервера)
  const nextSeq = () => mediaSeq++;
  const ctx = { nextSeq };

  list.forEach((m, mIdx) => {
    const day = new Date(m.time).toDateString();
    if(day !== lastDay){
      const div = document.createElement('div');
      div.className = 'day-divider';
      div.textContent = relativeDayLabel(new Date(m.time));
      el.appendChild(div);
      lastDay = day;
    }
    if(mIdx === firstUnreadIdx){
      unreadDividerEl = document.createElement('div');
      unreadDividerEl.className = 'unread-divider';
      unreadDividerEl.textContent = t('chatView.unreadDivider');
      el.appendChild(unreadDividerEl);
    }
    // Даунгрейд-баннер (см. net/messaging/incoming.js: m.downgraded) - сообщение
    // пришло без <encrypted>, хотя чат с этим собеседником обычно зашифрован.
    // Одной маленькой иконки 🔓 в пузыре (см. renderMessageRow ниже) для такого
    // случая недостаточно - это явный признак возможной MITM-подмены станзы,
    // поэтому рисуем отдельную заметную плашку прямо над сообщением.
    if(m.downgraded && !m.out){
      const banner = document.createElement('div');
      banner.className = 'downgrade-banner';
      banner.textContent = '⚠️ ' + t('chatView.downgradeBanner');
      el.appendChild(banner);
    }
    renderMessageRow(el, m, mIdx, ctx);
  });

  if(unreadDividerEl){
    // Показываем чат сразу на первом непрочитанном (как Telegram/WhatsApp),
    // а не в самом низу - иначе пользователь пролистает мимо плашки, не заметив её.
    unreadDividerEl.scrollIntoView({block:'center'});
    _watchUnreadDivider(unreadDividerEl, S.activeChat);
  } else if(wasAtBottom){
    // Был долистан до конца (или чат только что открыт/ещё короче вьюпорта) -
    // новое сообщение снизу должно сразу попасть в поле зрения, как в Telegram.
    el.scrollTop = el.scrollHeight;
  } else {
    // Пролистнут выше - контент над текущей позицией просмотра не менялся
    // (новые сообщения дописываются только в конец), поэтому просто
    // возвращаем прежний scrollTop, а не прыгаем вниз следом за новым
    // сообщением.
    el.scrollTop = prevScrollTop;
  }
  if(_afterRender) _afterRender();
}
