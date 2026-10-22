// ===================== ui/chat-view/render-messages.js =====================
// Рендер списка сообщений чата (инлайн-медиа, цитаты, галочки). Разбор тела и HTML цитаты/инлайн-медиа - message-body-html.js, рендереры пузырей - bubble-renderers.js.
//
// ПРОИЗВОДИТЕЛЬНОСТЬ (riedchat-perf-notes.md, п.1): раньше каждый renderMessages() пересобирал весь DOM истории вместе со смонтированными плеерами. Теперь два слоя:
//   - list-diff.js    - keyed-diff узлов #messages: строка с известным data-key переиспользуется;
//   - virtual-list.js - в DOM монтируется только окно по индексам сообщений (растёт по краям при скролле).
// Служебные строки (дни/плашка непрочитанных/даунгрейд) строятся только для сообщений окна, поэтому DOM-операции и просчёт пропорциональны окну, а не истории.
import { debugLog, errMsg } from '../../core/debug-log.js';
import { $, isUnread, relativeDayLabel, isNearBottom, scrollToBottom } from '../../core/dom-utils.js';
import { ICON_LOCK_CLOSED, ICON_LOCK_OPEN } from '../../core/icons.js';
import { createLruMemo } from '../../core/lru-map.js';
import { html, raw, setHTML } from '../../core/safe-html.js';
import { state, messagesOf, activeMessages } from '../../core/state.js';
import { getLocale, t } from '../../i18n/t.js';

import { ticksHtml, renderBubble } from './bubble-renderers.js';
import { reconcileKeyedChildren } from './list-diff.js';
import { loadPlainImage } from './media-loader/defer-until-tap.js';
import { loadDeferredMedia } from './media-loader/encrypted-media.js';
import { loadQuoteThumbOrDefer } from './media-loader/quote-thumb.js';
import { classifySingleMedia } from './message-body-html.js';
import { watchUnreadDivider, stopUnreadTracking } from './unread-tracking.js';
import { getWindow, resetWindow, openWindowAroundIndex, growDirection, expandWindow, windowForUpdate } from './virtual-list.js';


// Колбэк после каждой синхронизации DOM (renderMessages, новые строки при скролле/appendMessage): message-select/ возвращает класс 'selected'. Регистрируется через onRenderMessages(), чтобы не было цикла render-messages.js <-> message-select/.
let _afterRender = () => {};
export function onRenderMessages(cb){ _afterRender = cb; }

// state.messages копится хронологично, но история на диске могла быть записана не по порядку (тогда сломаются разделители дней). sort() на каждый вызов дорог, поэтому сначала O(n)-проверка, сортируем только при нарушении.
const ts = m => m?.time || 0;
function sortedByTime(list){
  // Сортировка на месте: data-idx - индекс в state.messages[chat], его читают findRow/patchMessage*/свайп; копия разводила бы индексы.
  if(list.some((m, i) => i && ts(list[i - 1]) > ts(m))) list.sort((x, y) => ts(x) - ts(y));
  return list;
}

// Чат 1:1: отправитель определяется направлением.
const senderOf = m => m.out ? state.myBareJid : state.activeChat;

// Номер календарного дня в локальном часовом поясе без выделения строки; подпись разделителя (relativeDayLabel) считается только при смене дня.
function localDayKey(time){
  const d = new Date(time);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// ---------- СТРОКИ ОКНА ----------
// Окно виртуализации - индексы сообщений. Для сообщений окна достраиваются служебные строки: разделитель дня / плашка непрочитанных / баннер даунгрейда. key уникален в чате и между чатами (префикс bareJid), чтобы diff не переиспользовал узел чужого чата с тем же idx (см. list-diff.js).
function buildWindowRows(chatJid, list, win, firstUnreadIdx){
  const rows = [];
  // Ключ сообщения - по m.id, не по индексу: при удалении индексы сдвигаются, и с 'msg:<idx>' diff переиспользовал бы узлы со старым содержимым. Дубль/пустой id - откат на индекс (в пределах окна: reconcileKeyedChildren пропускает дубли ключей, и сообщение пропало бы).
  const seenIds = new Set();
  for(let i = win.top; i <= win.bottom; i++){
    const m = list[i];
    let idTok = m.id ? 'id:' + m.id : 'idx:' + i;
    if(seenIds.has(idTok)) idTok += '#' + i;
    seenIds.add(idTok);
    // День сравниваем с предыдущим сообщением списка, а не окна: первая строка окна не получает ложный разделитель.
    const dayKey = localDayKey(m.time);
    if(i === 0 || localDayKey(list[i - 1].time) !== dayKey){
      rows.push({ key: chatJid + '|day:' + dayKey, kind: 'day', time: m.time });
    }
    if(i === firstUnreadIdx){
      rows.push({ key: chatJid + '|unread', kind: 'unread' });
    }
    // Даунгрейд-баннер (incoming.js: m.downgraded): сообщение без <encrypted> в обычно зашифрованном чате - признак возможной MITM-подмены, поэтому заметная плашка над сообщением (иконки 🔓 мало).
    if(m.downgraded && !m.out){
      rows.push({ key: chatJid + '|downgrade:' + idTok, kind: 'downgrade' });
    }
    rows.push({ key: chatJid + '|msg:' + idTok, kind: 'msg', m, mIdx: i });
  }
  return rows;
}

// ---------- ПОСТРОЕНИЕ УЗЛОВ ----------
// Служебные строки (не сообщения): CSS-класс и текст.
const SERVICE_ROWS = {
  day:       { className: 'day-divider',      text: row => relativeDayLabel(new Date(row.time)) },
  unread:    { className: 'unread-divider',   text: () => t('chatView.unreadDivider') },
  downgrade: { className: 'downgrade-banner', text: () => '⚠️ ' + t('chatView.downgradeBanner') },
};

function buildRowNode(row, senderByKey){
  const service = SERVICE_ROWS[row.kind];
  if(service){
    const div = document.createElement('div');
    div.className = service.className;
    div.textContent = service.text(row);
    return div;
  }
  return buildMessageRowNode(row.m, row.mIdx, senderByKey, row.key);
}

// Замок шифрования рядом со временем; title экранируется через html``.
const lockHtml = m => html`<span class="lock" title="${m.encrypted ? 'OMEMO' : t('message.notEncrypted')}">${raw(m.encrypted ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN)}</span>`;

// Один Intl.DateTimeFormat на локаль: toLocaleTimeString создавал бы форматтер на каждое сообщение.
const timeFormat = createLruMemo(4);
function formatMsgTime(time){
  const d = new Date(time);
  if(Number.isNaN(d.getTime())) return String(d); // как toLocaleTimeString: 'Invalid Date', без исключения
  const locale = getLocale();
  return timeFormat(locale, () => new Intl.DateTimeFormat(locale, {hour:'2-digit', minute:'2-digit'})).format(d);
}

// Содержимое пузыря (время/замок/галочки + renderBubble) для первичной отрисовки и точечного патча. Возвращает {html, senderJid}.
function renderMessageContent(m){
  const time = formatMsgTime(m.time);
  return {
    ...renderBubble(m, classifySingleMedia(m.body), { lock: lockHtml(m), time, ticks: ticksHtml(m) }),
    // Чат 1:1: отправитель определяется направлением. Нужен для TOFU-доверия upload-хосту отправителя при скачивании чужих aesgcm://-вложений.
    senderJid: senderOf(m),
  };
}

// DOM одной строки сообщения (или строка с ошибкой, если сообщение повреждено). Отправитель (для догрузки медиа) кладётся в senderByKey: mountWindow запускает загрузчики только для созданных строк, не переиспользованных.
function buildMessageRowNode(m, mIdx, senderByKey, key){
  const row = document.createElement('div');
  row.className = 'msg-row ' + (m.out ? 'out' : 'in');
  // Индекс в state.messages[activeChat]: по нему свайп/выбор/патчи достают сообщение. Не путать с data-key (служебный, для diff).
  row.dataset.idx = mIdx;
  try{
    const rendered = renderMessageContent(m);
    setHTML(row, rendered.html);
    senderByKey.set(key, rendered.senderJid);
  }catch(e){
    // Одно повреждённое сообщение (например, body не строка) не должно ронять сборку окна - пропускаем только его.
    console.warn('не удалось отрисовать сообщение #' + mIdx + ' в чате ' + state.activeChat, e, m);
    debugLog('[render] сообщение #' + mIdx + ' повреждено и пропущено: ' + errMsg(e));
    setHTML(row, html`<div class="bubble">⚠️ ${t('message.corrupted')}</div>`);
  }
  return row;
}

// Загрузчики по data-media-type плейсхолдера (media-placeholder.js:mediaAttrs); получают сам элемент, url и holdOff.
const MEDIA_LOADERS = {
  'plain-image': (host, url) => loadPlainImage(host, url),
  // Карточка «добавить пак стикеров» грузится отдельным чанком по требованию.
  stickerpack: (host, url, holdOff, senderJid) =>
    import('../../features/stickers/pack-card.js').then(mod => mod.loadStickerPackCard(host, url, senderJid)),
  // Миниатюра медиа внутри цитаты - более лёгкая догрузка (media-loader/quote-thumb.js).
  'quote-thumb': (host, url, holdOff, senderJid) => loadQuoteThumbOrDefer(host, url, senderJid, holdOff),
  deferrable: (host, url, holdOff, senderJid) => loadDeferredMedia(host, url, holdOff, senderJid),
};

// Запускает загрузчики для всех плейсхолдеров внутри root (уже вставленного в DOM).
function runMediaLoaders(root, senderJid){
  for(const host of root.querySelectorAll('[data-media-type]')){
    const { mediaType, mediaUrl, hold } = host.dataset;
    (MEDIA_LOADERS[mediaType] || MEDIA_LOADERS.deferrable)(host, mediaUrl, hold === 'true', senderJid);
  }
}

// ---------- ОКНО ВИРТУАЛИЗАЦИИ ----------
// Индексная схема - virtual-list.js: окно растёт по краям при скролле.

let _scrollEl = null;
let _scrollScheduled = false;

// Монтирует в #messages окно сообщений [win.top..win.bottom], диффя с текущим DOM (list-diff.js). Общая точка для renderMessages()/appendMessage()/скролла. firstUnreadIdx - индекс первого непрочитанного в list (-1, если нет).
function mountWindow(el, chatJid, list, win, firstUnreadIdx){
  ensureScrollListener(el);

  const senderByKey = new Map();

  const winRows = buildWindowRows(chatJid, list, win, firstUnreadIdx);
  const rows = winRows.map(planRow => ({ key: planRow.key, build: () => buildRowNode(planRow, senderByKey) }));

  const { mounted, created } = reconcileKeyedChildren(el, rows);

  for(const planRow of winRows){
    const isNew = created.has(planRow.key);

    // Ключи стабильны (по id), а индекс при удалении меняется: переиспользованным узлам обновляем data-idx (выбор, свайп, правка, цитаты, патчи).
    if(planRow.kind === 'msg' && !isNew){
      const node = mounted.get(planRow.key);
      if(node && node.dataset.idx !== String(planRow.mIdx)) node.dataset.idx = planRow.mIdx;
    }

    if(!isNew) continue;

    // Строка без записи в senderByKey (служебная или повреждённая) плейсхолдеров не содержит.
    if(senderByKey.has(planRow.key)) runMediaLoaders(mounted.get(planRow.key), senderByKey.get(planRow.key));

    // Плашка «непрочитанные» только что появилась в DOM (первое открытие или возврат к ней после выпадения из буфера) - переподписываем IntersectionObserver. Переиспользованную строку не трогаем: подписка жива.
    if(planRow.kind === 'unread'){
      stopUnreadTracking();
      watchUnreadDivider(mounted.get(planRow.key), chatJid);
    }
  }

  return { mounted };
}

// Раздвижка окна в направлении dir ('up'|'down') и подрезка противоположного края - два раздельных прохода, не один mountWindow.
//
// Компенсация scrollTop: при изменении строк выше видимой области (вставка при 'up', выгрузка головы при 'down') сдвигаем el.scrollTop на разницу scrollHeight до/после. Единственное место чтения геометрии - только при реальной довставке. Строки ниже компенсации не требуют; проходы раздельны, чтобы вставка выше не смешалась в одно число с подрезкой ниже.
function growWindow(messagesEl, chatJid, list, dir){
  const up = dir === 'up';
  const { pre, win } = expandWindow(chatJid, list.length, dir);
  const firstUnreadIdx = list.findIndex(isUnread);
  const mountAbove = (target) => {
    const prevScrollHeight = messagesEl.scrollHeight;
    mountWindow(messagesEl, chatJid, list, target, firstUnreadIdx);
    const delta = messagesEl.scrollHeight - prevScrollHeight;
    if(up ? delta > 0 : delta < 0) messagesEl.scrollTop += delta;
  };
  if(up){
    mountAbove(pre);
    if(win.bottom !== pre.bottom) mountWindow(messagesEl, chatJid, list, win, firstUnreadIdx); // подрезка хвоста снизу
  }else{
    mountWindow(messagesEl, chatJid, list, pre, firstUnreadIdx);
    if(win.top !== pre.top) mountAbove(win); // выгрузка головы сверху
  }
}

function ensureScrollListener(el){
  if(_scrollEl === el) return;
  _scrollEl = el;
  el.addEventListener('scroll', () => {
    // Прокрутка без изменения данных: growDirection (длина списка и три числа, без замеров) проверяет «у края ли», и если да - раздвигаем окно на GROW_STEP (сверх WINDOW_SIZE - с подрезкой противоположного края). Иначе ни одной DOM-операции. rAF схлопывает scroll-события до одного пересчёта на кадр.
    if(_scrollScheduled) return;
    _scrollScheduled = true;
    requestAnimationFrame(() => {
      _scrollScheduled = false;
      const messagesEl = $('messages');
      if(!messagesEl) return;
      const chatJid = state.activeChat;
      const list = messagesOf(chatJid);
      if(!list.length) return;
      const dir = growDirection(chatJid, list.length, messagesEl);
      if(!dir) return;

      growWindow(messagesEl, chatJid, sortedByTime(list), dir);
      _afterRender();
    });
  }, {passive:true});
}

// ---------- MESSAGES ----------
export function renderMessages(){
  const el = $('messages');
  if(!el) return;
  const chatJid = state.activeChat;
  const list = sortedByTime(messagesOf(chatJid));

  if(list.length === 0){
    // Пустой чат/история не загружена: очищаем и забываем окно (при новых сообщениях откроется заново).
    stopUnreadTracking();
    el.textContent = '';
    resetWindow(chatJid);
    _afterRender();
    return;
  }

  // Снимок скролла до перестройки: новые сообщения добавляются снизу, поэтому если пользователь не был внизу, scrollTop оставляем как есть.
  const wasAtBottom = isNearBottom(el);
  const isFirstOpen = !getWindow(chatJid);

  const firstUnreadIdx = list.findIndex(isUnread);
  const hasUnread = firstUnreadIdx !== -1;
  // Отслеживать больше нечего (чат прочитан в обход markChatRead/скролла мимо плашки) - глушим прошлую подписку.
  if(!hasUnread) stopUnreadTracking();

  const pin = isFirstOpen || wasAtBottom;
  const win = hasUnread
    ? openWindowAroundIndex(chatJid, list.length, firstUnreadIdx)
    : windowForUpdate(chatJid, list.length, pin);

  const { mounted } = mountWindow(el, chatJid, list, win, firstUnreadIdx);

  // Открываем чат на первом непрочитанном (как Telegram/WhatsApp), чтобы плашку не пролистали. Подписка IntersectionObserver уже сделана в mountWindow.
  if(hasUnread) mounted.get(chatJid + '|unread')?.scrollIntoView({block:'center'});
  else if(pin) scrollToBottom(el);
  // Иначе окно открыто на прежнем месте, scrollTop не трогаем.

  _afterRender();
}

// ---------- ТОЧЕЧНЫЕ ПАТЧИ (без полной синхронизации окна) ----------
// Два патча (галочка «прочитано», правка сообщения) правят одну строку по data-idx. Если строка вне окна виртуализации - ничего не делают: её отрисует следующий проход.

// Смонтированная строка по data-idx; null, если её нет в DOM (вне окна). Общая точка для патчей, поиска по чату и перехода по цитате.
export function findMessageRow(mIdx){
  return $('messages')?.querySelector('.msg-row[data-idx="' + mIdx + '"]') || null;
}

// Как findMessageRow, но если строка вне окна виртуализации - перемещает окно (WINDOW_SIZE строк) вокруг mIdx, монтирует его и мгновенно прокручивает к строке. Для перехода из поиска и по цитате; null - сообщения с таким индексом нет.
export function ensureMessageRow(mIdx){
  const existing = findMessageRow(mIdx);
  if(existing) return existing;
  const el = $('messages');
  const chatJid = state.activeChat;
  if(!el || !chatJid) return null;
  const list = sortedByTime(messagesOf(chatJid));
  if(!Number.isInteger(Number(mIdx)) || !list[mIdx]) return null;
  const win = openWindowAroundIndex(chatJid, list.length, Number(mIdx));
  mountWindow(el, chatJid, list, win, list.findIndex(isUnread));
  const row = findMessageRow(mIdx);
  if(row) row.scrollIntoView({block: 'center'});
  _afterRender();
  return row;
}

// Строка и сообщение из state.messages[активный чат]; null, если нет строки или сообщения.
function findRow(mIdx){
  const row = findMessageRow(mIdx);
  const m = activeMessages()[mIdx];
  return row && m ? { row, m } : null;
}

// Обновляет только галочки (XEP-0333 <displayed/>) нашего исходящего по индексу в state.messages[активный чат].
export function patchMessageTicks(mIdx){
  const found = findRow(mIdx);
  // Нет строки (вне окна) или .ticks (у входящих галочек нет) - не критично. Пустой ticksHtml убирает элемент.
  const ticksEl = found?.row.querySelector('.ticks');
  if(ticksEl) ticksEl.outerHTML = String(ticksHtml(found.m));
}

// Перерисовывает содержимое одной строки (правка, XEP-0308) без пересоздания строки и соседей.
export function patchMessageBody(mIdx){
  const found = findRow(mIdx);
  if(!found) return; // строка не смонтирована (вне окна) - не критично
  const { row, m } = found;
  const rendered = renderMessageContent(m);
  setHTML(row, rendered.html);
  runMediaLoaders(row, rendered.senderJid);
}

// Дописывает сообщения в конец. newIdx - индекс сообщения, из-за которого вызвали (state.messages[активный чат]); нужен только как защита от вызова до push, окно пересчитывается по всему списку.
// mountWindow строит план по актуальному state.messages, а keyed-diff (list-diff.js) сам находит и дорисовывает недостающий хвост, поэтому откат на renderMessages() не нужен ни при каком newIdx (раньше параллельные OMEMO-расшифровки с push не по порядку вызывали лишний полный рендер).
export function appendMessage(newIdx){
  const el = $('messages');
  if(!el) return;
  const chatJid = state.activeChat;
  const list = messagesOf(chatJid);
  if(!list.length || !list[newIdx]) return; // нечего дорисовывать - защита от вызова до push
  sortedByTime(list); // читаем state.messages заново - видим и newIdx, и более поздние

  const wasAtBottom = isNearBottom(el);
  const win = windowForUpdate(chatJid, list.length, wasAtBottom);

  mountWindow(el, chatJid, list, win, list.findIndex(isUnread));

  // Был внизу - новое сообщение должно попасть в поле зрения (как в Telegram). Не был - контент выше не менялся, scrollTop не трогаем.
  if(wasAtBottom) scrollToBottom(el);

  _afterRender();
}
