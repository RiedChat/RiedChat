// ===================== ui/chat-view/render-messages.js =====================
// Рендер списка сообщений чата (включая инлайн-медиа, цитаты, галочки).
// Разбор "что за медиа в теле" и HTML цитаты/инлайн-медиа - в chat-view/
// message-body-html.js. Рендереры по типу пузыря - в chat-view/
// bubble-renderers.js.
//
// ПРОИЗВОДИТЕЛЬНОСТЬ (см. riedchat-perf-notes.md, п.1): раньше renderMessages()
// на КАЖДЫЙ чих (новое сообщение, галочка, mam-догрузка) делал el.innerHTML=''
// и заново собирал HTML+DOM всей истории чата целиком - на длинных тредах
// (тысячи сообщений) это означало пересоздание тысяч узлов, включая уже
// смонтированные voice/video-плееры, которые от этого перезапускались.
// Теперь список строится в два слоя:
//   - list-diff.js    - keyed-diff дочерних узлов #messages: строка с уже
//                        встречавшимся ключом (data-key) переиспользуется
//                        как есть, а не пересоздаётся;
//   - virtual-list.js - виртуализация: реально в DOM монтируется только
//                        окно строк плана по ИНДЕКСАМ (растёт по краям при
//                        скролле, см. virtual-list.js), а не весь список.
// Вместе они превращают "DOM-операции пропорциональны всей истории чата" в
// "DOM-операции пропорциональны видимому окну", а сам просчёт (кто вообще
// новый/что за день/где непрочитанные) остаётся дешёвым O(n) проходом без
// единой DOM-мутации - его не жалко гонять на каждый скролл.
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
import { reconcileKeyedChildren } from './list-diff.js';
import { getWindow, resetWindow, openWindowAtEnd, openWindowAroundIndex, pinWindowToEnd, clampWindowToLength, growDirection, growWindowUp, growWindowDown } from './virtual-list.js';

const S = state;

// Колбэк, вызываемый после каждой синхронизации DOM (полный renderMessages(),
// но также появление новых строк из-за скролла/appendMessage) - используется
// features/message-select.js, чтобы вернуть класс 'selected' на строки,
// отмеченные пользователем. Регистрируется через onRenderMessages(), а не
// статическим импортом, чтобы не заводить циклическую зависимость
// render-messages.js <-> message-select.js.
let _afterRender = null;
export function onRenderMessages(cb){ _afterRender = cb; }

// id media-плейсхолдеров (media-N-0) должны быть уникальны среди ВСЕХ
// строк, реально живущих сейчас в DOM списка (а с виртуализацией это
// подавляющее меньшинство от всей истории) - счётчик один на весь модуль
// и только растёт, чтобы новый id не совпал с id уже смонтированного узла.
let _mediaSeq = 0;
const nextMediaSeq = () => _mediaSeq++;

// Сообщения в S.messages должны накапливаться хронологично (push при
// получении/отправке), но история на диске могла быть один раз записана
// не по порядку - тогда разделители дней ниже расставлялись бы неверно.
// На больших историях O(n log n) sort()+копия массива на КАЖДЫЙ вызов уже
// заметны, поэтому сначала за O(n) проверяем, действительно ли список не
// по порядку, и копируем+сортируем только тогда, когда нашли нарушение.
function isSorted(list){
  for(let i = 1; i < list.length; i++){
    const prev = list[i - 1], cur = list[i];
    if((prev && prev.time || 0) > (cur && cur.time || 0)) return false;
  }
  return true;
}
function sortedByTime(list){
  if(isSorted(list)) return list;
  return list.slice().sort((a, b) => (a && a.time || 0) - (b && b.time || 0));
}

// Первое непрочитанное входящее - перед ним рисуем плашку "Непрочитанные
// сообщения". Все входящие после него по построению тоже непрочитанные
// (сообщения хронологичны), поэтому одной точки вставки достаточно.
function findFirstUnreadIndex(list){
  return list.findIndex(m => m && !m.out && m.read === false);
}

// Целочисленный номер календарного дня в ЛОКАЛЬНОМ часовом поясе - без
// выделения строки (в отличие от старого `new Date(m.time).toDateString()`,
// который вызывался на КАЖДОЕ сообщение). Строка для самой подписи
// разделителя (relativeDayLabel) считается один раз - только когда день и
// правда сменился, а не на каждое сообщение.
function localDayKey(ts){
  const d = new Date(ts);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

// ---------- ПЛАН СПИСКА ----------
// "Логическая" строка списка: разделитель дня / плашка непрочитанных /
// баннер даунгрейда / само сообщение. key уникален в пределах чата и ещё
// раз - в пределах ВСЕХ чатов (префикс bareJid), чтобы при переключении
// чата diff не переиспользовал случайно совпавший по числовому idx узел
// ЧУЖОГО чата (см. list-diff.js).
function buildRowPlan(chatJid, list, firstUnreadIdx){
  const plan = [];
  let unreadRowIndex = -1;
  let lastDayKey = null;
  list.forEach((m, mIdx) => {
    const dayKey = localDayKey(m.time);
    if(dayKey !== lastDayKey){
      plan.push({ key: chatJid + '|day:' + dayKey, kind: 'day', time: m.time });
      lastDayKey = dayKey;
    }
    if(mIdx === firstUnreadIdx){
      unreadRowIndex = plan.length;
      plan.push({ key: chatJid + '|unread', kind: 'unread' });
    }
    // Даунгрейд-баннер (см. net/messaging/incoming.js: m.downgraded) - сообщение
    // пришло без <encrypted>, хотя чат с этим собеседником обычно зашифрован -
    // явный признак возможной MITM-подмены станзы, поэтому отдельная заметная
    // плашка прямо над сообщением (одной иконки 🔓 в самом пузыре недостаточно).
    if(m.downgraded && !m.out){
      plan.push({ key: chatJid + '|downgrade:' + mIdx, kind: 'downgrade' });
    }
    plan.push({ key: chatJid + '|msg:' + mIdx, kind: 'msg', m, mIdx });
  });
  return { plan, unreadRowIndex };
}

// Дешёвый снимок плана для активного чата - вызывается в начале renderMessages()/
// appendMessage()/скролл-пересчёта. isSorted/findFirstUnreadIndex/buildRowPlan
// вместе - один O(n) проход без единой DOM-операции, поэтому пересчитывать
// его заново на каждый вызов дешевле и надёжнее, чем городить инвалидацию кэша.
function currentPlan(){
  const chatJid = S.activeChat;
  const list = sortedByTime(S.messages[chatJid] || []);
  const firstUnreadIdx = findFirstUnreadIndex(list);
  const { plan, unreadRowIndex } = buildRowPlan(chatJid, list, firstUnreadIdx);
  return { chatJid, list, plan, unreadRowIndex };
}

// ---------- ПОСТРОЕНИЕ УЗЛОВ ----------
function buildRowNode(row, ctx, mediaByKey){
  if(row.kind === 'day'){
    const div = document.createElement('div');
    div.className = 'day-divider';
    div.textContent = relativeDayLabel(new Date(row.time));
    return div;
  }
  if(row.kind === 'unread'){
    const div = document.createElement('div');
    div.className = 'unread-divider';
    div.textContent = t('chatView.unreadDivider');
    return div;
  }
  if(row.kind === 'downgrade'){
    const div = document.createElement('div');
    div.className = 'downgrade-banner';
    div.textContent = '⚠️ ' + t('chatView.downgradeBanner');
    return div;
  }
  return buildMessageRowNode(row.m, row.mIdx, ctx, mediaByKey, row.key);
}

// Строит DOM одной строки сообщения (или строки с ошибкой, если сообщение
// повреждено). Медиа для догрузки складывается в mediaByKey (а не грузится
// сразу отсюда) - вызывающий код (mountWindow) запускает загрузчики ТОЛЬКО
// для строк, которые реально только что созданы, а не переиспользованы.
function buildMessageRowNode(m, mIdx, ctx, mediaByKey, key){
  const row = document.createElement('div');
  try{
    const time = new Date(m.time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
    const lock = m.encrypted ? `<span class="lock" title="OMEMO">${ICON_LOCK_CLOSED}</span>` : `<span class="lock" title="${t('message.notEncrypted')}">${ICON_LOCK_OPEN}</span>`;
    const ticks = ticksHtml(m);
    const bubbleCtx = {lock, time, ticks, nextSeq: ctx.nextSeq};

    const singleMedia = classifySingleMedia(m.body);
    const rendered = renderBubble(m, singleMedia, bubbleCtx);

    row.className = 'msg-row ' + (m.out ? 'out' : 'in');
    // Индекс в S.messages[activeChat] - по нему свайп/выбор/точечные патчи
    // (patchMessageTicks/patchMessageBody ниже) достают исходный объект
    // сообщения; НЕ путать с data-key (см. buildRowPlan) - тот служебный,
    // для diff, этот - публичный контракт с остальным кодом.
    row.dataset.idx = mIdx;
    setHTML(row, raw(rendered.html));

    // Чат всегда 1:1, поэтому отправитель конкретного сообщения однозначно
    // определяется его направлением - нужно для TOFU-доверия upload-хосту
    // отправителя при скачивании чужих aesgcm://-вложений.
    const senderJid = m.out ? S.myBareJid : S.activeChat;
    mediaByKey.set(key, { media: rendered.media, senderJid });
  }catch(e){
    // Одно повреждённое сообщение (например, body не строка из-за старого
    // сбоя записи) не должно ронять всю сборку окна - пропускаем только эту
    // строку и продолжаем с остальными.
    console.warn('не удалось отрисовать сообщение #' + mIdx + ' в чате ' + S.activeChat, e, m);
    debugLog('[render] сообщение #' + mIdx + ' повреждено и пропущено: ' + (e && e.message ? e.message : e));
    row.className = 'msg-row ' + (m && m.out ? 'out' : 'in');
    row.dataset.idx = mIdx;
    setHTML(row, html`<div class="bubble">⚠️ ${t('message.corrupted')}</div>`);
  }
  return row;
}

function runMediaLoaders(media, senderJid){
  media.forEach(({type, id, url, holdOff, kind, isNote}) => {
    if(type === 'voice') loadEncryptedMedia(id, url, senderJid);
    else if(type === 'plain-image') loadPlainImage(id, url);
    // Карточка "добавить пак стикеров" - код грузится отдельным чанком по
    // требованию, а не для каждого открытия чата.
    else if(type === 'stickerpack') import('../../features/stickers/pack-card.js').then(mod => mod.loadStickerPackCard(id, url, senderJid));
    // Миниатюра фото/видео/кружка/стикера ВНУТРИ самой цитаты - отдельная,
    // более лёгкая догрузка (см. ui/chat-view/message-body-html.js).
    else if(type === 'quote-thumb') _loadQuoteThumbOrDefer(id, url, kind, isNote, senderJid, holdOff);
    else _loadMediaOrDeferForVideo(id, url, holdOff, senderJid);
  });
}

// ---------- ОКНО ВИРТУАЛИЗАЦИИ ----------
// Индексная схема - см. virtual-list.js: окно растёт по краям при скролле,
// компенсация scrollTop нужна только при довставке строк ВЫШЕ видимой
// области (см. growDirection/ensureScrollListener ниже).

let _scrollWired = false;
let _scrollScheduled = false;

// Монтирует в #messages ровно то окно плана [win.top..win.bottom], диффя
// его с уже стоящим DOM (см. list-diff.js) вместо el.innerHTML=''+
// пересборки. Общая точка для renderMessages()/appendMessage()/скролл-
// пересчёта.
function mountWindow(el, chatJid, plan, win){
  ensureScrollListener(el);

  const mediaByKey = new Map();
  const ctx = { nextSeq: nextMediaSeq };

  const rows = [];
  for(let i = win.top; i <= win.bottom; i++){
    const planRow = plan[i];
    rows.push({ key: planRow.key, build: () => buildRowNode(planRow, ctx, mediaByKey) });
  }

  const { mounted, created } = reconcileKeyedChildren(el, rows);

  for(const key of created){
    const info = mediaByKey.get(key);
    if(info) runMediaLoaders(info.media, info.senderJid);
  }

  // Плашка "непрочитанные" только что появилась в DOM (первое открытие чата
  // ИЛИ пользователь долистал обратно к ней после того, как она выпадала из
  // буфера виртуализации) - подписываем IntersectionObserver заново. Если
  // строка просто переиспользована (была в DOM и на прошлом вызове) -
  // ничего не трогаем, старая подписка всё ещё живая и рабочая.
  for(let i = win.top; i <= win.bottom; i++){
    const planRow = plan[i];
    if(planRow.kind === 'unread' && created.has(planRow.key)){
      _stopUnreadTracking();
      _watchUnreadDivider(mounted.get(planRow.key), chatJid);
    }
  }

  return { win, mounted, created };
}

function ensureScrollListener(el){
  if(_scrollWired) return;
  el.addEventListener('scroll', () => {
    // Чистая прокрутка без изменения данных - проверяем только "у края ли
    // мы" (growDirection - три числа, без перемера строк) и, если да,
    // раздвигаем окно на GROW_STEP строк (при превышении MAX_WINDOW_SIZE -
    // с подрезкой противоположного края, см. virtual-list.js). Если не у
    // края - вообще ничего не делаем, ни единой DOM-операции. rAF схлопывает
    // частые события scroll в максимум один пересчёт на кадр.
    if(_scrollScheduled) return;
    _scrollScheduled = true;
    requestAnimationFrame(() => {
      _scrollScheduled = false;
      const messagesEl = $('messages');
      if(!messagesEl) return;
      const { chatJid, plan } = currentPlan();
      if(!plan.length) return;
      const dir = growDirection(chatJid, plan.length, messagesEl);
      if(!dir) return;

      // Раздвижка И подрезка противоположного края монтируются ДВУМЯ
      // раздельными проходами (а не одним mountWindow на итоговое окно) -
      // иначе разница scrollHeight "до/после" смешала бы вставку выше
      // видимой области (нужна компенсация) с подрезкой хвоста ниже неё
      // (компенсации не требует) в одно число и компенсация вышла бы неверной.
      if(dir === 'up'){
        const { pre, win } = growWindowUp(chatJid, plan.length);
        // Фаза 1: вставка строк ВЫШЕ видимой области - без компенсации то,
        // что уже было на экране, "уедет" вниз на высоту вставленного.
        const prevScrollHeight = messagesEl.scrollHeight;
        mountWindow(messagesEl, chatJid, plan, pre);
        const inserted = messagesEl.scrollHeight - prevScrollHeight;
        if(inserted > 0) messagesEl.scrollTop += inserted;
        // Фаза 2: подрезка хвоста СНИЗУ (если размер окна превысил лимит) -
        // эти строки ниже видимой области, компенсация не нужна.
        if(win.bottom !== pre.bottom){
          mountWindow(messagesEl, chatJid, plan, win);
        }
      } else {
        const { pre, win } = growWindowDown(chatJid, plan.length);
        // Фаза 1: довставка строк НИЖЕ видимой области - браузер ничего не
        // сдвигает, когда контент появляется под текущей позицией просмотра.
        mountWindow(messagesEl, chatJid, plan, pre);
        // Фаза 2: выгрузка головы окна СВЕРХУ (если размер превысил лимит) -
        // эти строки ВЫШЕ видимой области, значит без компенсации оставшийся
        // контент "подъедет" вверх на их высоту - компенсируем так же, как
        // при вставке сверху, только с обратным знаком.
        if(win.top !== pre.top){
          const prevScrollHeight = messagesEl.scrollHeight;
          mountWindow(messagesEl, chatJid, plan, win);
          const removed = prevScrollHeight - messagesEl.scrollHeight;
          if(removed > 0) messagesEl.scrollTop -= removed;
        }
      }
      if(_afterRender) _afterRender();
    });
  }, {passive:true});
  _scrollWired = true;
}

// ---------- MESSAGES ----------
// Насколько близко к низу нужно быть ДО перерисовки, чтобы посчитать это
// "чат долистан до конца" и автоскроллить вниз при новом сообщении - а не
// точное равенство, чтоб под-пиксельные округления scrollHeight/clientHeight
// в разных браузерах не считались "не долистано".
const AT_BOTTOM_THRESHOLD_PX = 48;

export function renderMessages(){
  const el = $('messages');
  if(!el) return;
  const { chatJid, plan, unreadRowIndex } = currentPlan();

  if(plan.length === 0){
    // Пустой чат (или ещё не загруженная история) - окну нечего вычислять,
    // просто очищаем и забываем окно (при новых сообщениях откроется заново).
    _stopUnreadTracking();
    el.textContent = '';
    resetWindow(chatJid);
    if(_afterRender) _afterRender();
    return;
  }

  // Снимок положения скролла ДО перестройки DOM: новые сообщения
  // добавляются только СНИЗУ существующей истории, значит содержимое выше
  // текущей позиции просмотра не меняется - если человек не был внизу, его
  // scrollTop нужно просто оставить как было, а не сбрасывать вниз.
  const wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= AT_BOTTOM_THRESHOLD_PX;
  const isFirstOpen = !getWindow(chatJid);

  if(unreadRowIndex === -1){
    // Больше нечего отслеживать (например, чат помечен прочитанным откуда-то
    // ещё, минуя обычный путь через _markChatRead/скролл-мимо-плашки) -
    // на всякий случай глушим прошлую подписку, а не оставляем висеть.
    _stopUnreadTracking();
  }

  let win, jumpMode;
  if(unreadRowIndex !== -1){
    jumpMode = 'unread';
    win = openWindowAroundIndex(chatJid, plan.length, unreadRowIndex);
  } else if(isFirstOpen || wasAtBottom){
    jumpMode = 'bottom';
    win = pinWindowToEnd(chatJid, plan.length);
  } else {
    // Окно уже было открыто на этом чате и пользователь не у низа - просто
    // подрезаем его границы под актуальную длину плана, саму позицию
    // просмотра не трогаем вовсе.
    jumpMode = 'preserve';
    win = clampWindowToLength(chatJid, plan.length);
  }

  const { mounted } = mountWindow(el, chatJid, plan, win);

  if(jumpMode === 'unread'){
    // Показываем чат сразу на первом непрочитанном (как Telegram/WhatsApp),
    // а не в самом низу - иначе пользователь пролистает мимо плашки, не
    // заметив её. Подписка на IntersectionObserver уже сделана в mountWindow.
    const unreadEl = mounted.get(plan[unreadRowIndex].key);
    if(unreadEl) unreadEl.scrollIntoView({block:'center'});
  } else if(jumpMode === 'bottom'){
    el.scrollTop = el.scrollHeight;
  }
  // 'preserve': окно и так открыто на прежнем месте, scrollTop трогать не нужно.

  if(_afterRender) _afterRender();
}

// ---------- ТОЧЕЧНЫЕ ПАТЧИ (без полной синхронизации окна) ----------
// Два патча ниже покрывают самые частые события чата (входящая галочка
// "прочитано", входящая/исходящая правка сообщения) и правят ровно одну
// DOM-строку по её data-idx, не трогая соседние - если строка сейчас вне
// окна виртуализации (вне буфера ± вьюпорт), просто ничего не делают:
// строка не видна пользователю, следующий проход через неё (скролл к ней
// или новое сообщение) отрисует её уже в актуальном виде.

// Обновляет только галочки "отправлено/прочитано" (XEP-0333 <displayed/>)
// у одного нашего исходящего сообщения по его индексу в S.messages[активный чат].
export function patchMessageTicks(mIdx){
  const el = $('messages');
  const row = el && el.querySelector('.msg-row[data-idx="' + mIdx + '"]');
  if(!row) return; // строка сейчас не смонтирована (вне окна виртуализации) - не критично
  const m = (S.messages[S.activeChat] || [])[mIdx];
  if(!m) return;
  const ticksEl = row.querySelector('.ticks');
  const newTicksHtml = ticksHtml(m);
  if(!ticksEl){
    if(!newTicksHtml) return;
    return; // входящие галочек не имеют вовсе - сюда попасть для них не должны
  }
  if(!newTicksHtml){ ticksEl.remove(); return; }
  const tmp = document.createElement('div');
  setHTML(tmp, raw(newTicksHtml));
  ticksEl.replaceWith(tmp.firstElementChild);
}

// Перерисовывает содержимое ОДНОЙ строки (правка текста, XEP-0308) без
// пересоздания самой строки и без трогания соседних.
export function patchMessageBody(mIdx){
  const el = $('messages');
  const row = el && el.querySelector('.msg-row[data-idx="' + mIdx + '"]');
  const m = (S.messages[S.activeChat] || [])[mIdx];
  if(!row || !m) return; // строка сейчас не смонтирована (вне окна виртуализации) - не критично
  const time = new Date(m.time).toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
  const lock = m.encrypted ? `<span class="lock" title="OMEMO">${ICON_LOCK_CLOSED}</span>` : `<span class="lock" title="${t('message.notEncrypted')}">${ICON_LOCK_OPEN}</span>`;
  const ticks = ticksHtml(m);
  const bubbleCtx = {lock, time, ticks, nextSeq: nextMediaSeq};
  const singleMedia = classifySingleMedia(m.body);
  const rendered = renderBubble(m, singleMedia, bubbleCtx);
  setHTML(row, raw(rendered.html));
  const senderJid = m.out ? S.myBareJid : S.activeChat;
  runMediaLoaders(rendered.media, senderJid);
}

// Дописывает новые сообщения в конец истории. mIdx - индекс сообщения,
// из-за которого вызвали appendMessage (в S.messages[активный чат]) -
// раньше ТРЕБОВАЛОСЬ, чтобы это было строго mIdx===list.length-1, а любое
// расхождение (например, две OMEMO-расшифровки шли параллельно и та, что
// стартовала раньше, финишировала позже - её push() в S.messages пришёл
// НЕ последним) откатывало на полный renderMessages() - лишний прыжок к
// непрочитанным/в низ и повторный проход по всей истории просто чтобы
// дорисовать 1-2 сообщения.
//
// Теперь mIdx используется только как ПОВОД пересчитать окно - сам пересчёт
// (mountWindow ниже) всегда строит план по АКТУАЛЬНОМУ S.messages[activeChat]
// и keyed-diff (list-diff.js) сам находит недостающий хвост (новые ключи
// 'msg:<idx>') и дорисовывает ТОЛЬКО его, не трогая остальное - откат на
// renderMessages() для этого больше не нужен ни при каком mIdx.
export function appendMessage(mIdx){
  const el = $('messages');
  if(!el) return;
  const list = S.messages[S.activeChat] || [];
  if(!list.length || !list[mIdx]) return; // нечего дорисовывать - защита от вызова до какого-либо push
  const { chatJid, plan } = currentPlan(); // читает S.messages заново - видит и mIdx, и всё, что пришло позже него
  if(!plan.length) return;

  const wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) <= AT_BOTTOM_THRESHOLD_PX;
  const win = wasAtBottom
    ? pinWindowToEnd(chatJid, plan.length)
    : clampWindowToLength(chatJid, plan.length);

  mountWindow(el, chatJid, plan, win);

  // Был долистан до конца - новое сообщение снизу должно сразу попасть в
  // поле зрения, как в Telegram. Не был - контент над текущей позицией
  // просмотра не менялся (новое добавляется ниже неё), scrollTop трогать
  // не нужно вовсе.
  if(wasAtBottom) el.scrollTop = el.scrollHeight;

  if(_afterRender) _afterRender();
}
