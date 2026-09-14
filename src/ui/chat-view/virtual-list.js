// ===================== ui/chat-view/virtual-list.js =====================
// Виртуализация списка сообщений: в DOM смонтировано окно строк плана
// [window.top..window.bottom] (индексы, см. render-messages.js:buildRowPlan).
//
// Была версия на flex-direction:column-reverse (архитектура converse.js) -
// откачена: её семантика scrollTop не была проверена вживую в браузере и
// на практике завела баг (окно не сдвигалось за пределы первых 100 строк).
// Вместо неё - обычный (не reversed) контейнер и классическая, десятки лет
// использующаяся в чатах техника: при довставке строк ВЫШЕ видимой области
// (скролл вверх, к старым сообщениям) - один раз компенсируем el.scrollTop
// на разницу scrollHeight ДО/ПОСЛЕ вставки, чтобы контент, который уже был
// на экране, не "уехал" вниз. Это ЕДИНСТВЕННОЕ место в модуле, где вообще
// читается geometry - и то одним числом (scrollHeight до/после), а не
// перемером каждой строки, и вызывается только в момент реальной довставки
// (когда пользователь подскроллил к краю), а не на каждый scroll-тик.
//
// Довставка строк НИЖЕ видимой области (к новым сообщениям) компенсации не
// требует вовсе: браузер сам ничего не сдвигает, когда контент появляется
// ниже текущей позиции просмотра.
//
// Окно только РАСТЁТ во время скролла (никогда не обрезается снизу/сверху
// автоматически) - обрезка вверх исключена из этой версии сознательно:
// удаление строк ВЫШЕ видимой области потребовало бы такой же компенсации
// scrollTop, как и вставка, а лишний код без крайней необходимости (истории
// на сотни-тысячи сообщений, не сотни тысяч) добавлять не стали. Единственное
// исключение - clampWindowToLength ниже, который подрезает окно, если план
// стал КОРОЧЕ (сообщение удалено), а не длиннее.
const WINDOW_SIZE = 100;   // размер окна при первом открытии чата/прыжке
const GROW_STEP = 30;      // на сколько строк раздвигаем окно у края
const EDGE_THRESHOLD_PX = 600; // "у края" - за сколько px до конца окна подгружаем добавку

const windowByChat = new Map(); // chatJid -> { top, bottom } (индексы в plan)

export function getWindow(chatJid){
  return windowByChat.get(chatJid) || null;
}

export function resetWindow(chatJid){
  windowByChat.delete(chatJid);
}

function clamp(win, planLength){
  win.bottom = Math.min(win.bottom, planLength - 1);
  win.top = Math.max(0, Math.min(win.top, win.bottom));
  return win;
}

// Открыть окно с конца истории - обычное открытие чата без непрочитанных.
export function openWindowAtEnd(chatJid, planLength){
  const bottom = planLength - 1;
  const win = { top: Math.max(0, bottom - WINDOW_SIZE), bottom };
  windowByChat.set(chatJid, win);
  return win;
}

// Открыть окно вокруг конкретного индекса плана - прыжок к первому
// непрочитанному при открытии чата.
export function openWindowAroundIndex(chatJid, planLength, index){
  const top = Math.max(0, index - Math.floor(WINDOW_SIZE / 2));
  const win = { top, bottom: Math.min(planLength - 1, top + WINDOW_SIZE) };
  windowByChat.set(chatJid, win);
  return win;
}

// Подтянуть уже открытое окно к концу истории (новое сообщение пришло, а
// пользователь и так был внизу) - если окна ещё нет, открывает заново.
export function pinWindowToEnd(chatJid, planLength){
  const win = windowByChat.get(chatJid) || { top: 0, bottom: 0 };
  win.bottom = planLength - 1;
  win.top = Math.max(0, win.bottom - WINDOW_SIZE);
  windowByChat.set(chatJid, win);
  return win;
}

// Подрезать границы уже открытого окна под актуальную длину плана (план
// стал короче - сообщение удалено), не двигая сам просмотр.
export function clampWindowToLength(chatJid, planLength){
  const win = windowByChat.get(chatJid);
  if(!win) return openWindowAtEnd(chatJid, planLength);
  return clamp(win, planLength);
}

// Нужно ли раздвинуть окно от текущего скролла - и в какую сторону.
// Смотрит только на три агрегатных числа (scrollTop/scrollHeight/clientHeight),
// которые браузер и так считает сам - ни одного obeisance к offsetHeight
// отдельных строк. 'up'/'down'/null - вызывающий код (render-messages.js)
// решает, нужна ли компенсация scrollTop (нужна только для 'up').
export function growDirection(chatJid, planLength, el){
  const win = windowByChat.get(chatJid);
  if(!win) return null;
  if(win.top > 0 && el.scrollTop < EDGE_THRESHOLD_PX) return 'up';
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if(win.bottom < planLength - 1 && distanceToBottom < EDGE_THRESHOLD_PX) return 'down';
  return null;
}

export function growWindowUp(chatJid, planLength){
  const win = windowByChat.get(chatJid);
  if(!win) return openWindowAtEnd(chatJid, planLength);
  win.top = Math.max(0, win.top - GROW_STEP);
  return clamp(win, planLength);
}

export function growWindowDown(chatJid, planLength){
  const win = windowByChat.get(chatJid);
  if(!win) return openWindowAtEnd(chatJid, planLength);
  win.bottom = Math.min(planLength - 1, win.bottom + GROW_STEP);
  return clamp(win, planLength);
}
