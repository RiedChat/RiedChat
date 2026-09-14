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
// Окно - скользящее и ограничено по размеру MAX_WINDOW_SIZE: при раздвижке
// у одного края, если общий размер окна превышает лимит, ПРОТИВОПОЛОЖНЫЙ
// край подрезается на столько же строк (чанками по GROW_STEP), т.е. старые
// строки реально выгружаются из DOM (см. reconcileKeyedChildren в
// list-diff.js - убирает узлы, отсутствующие в новом плане), а не копятся
// бесконечно. При обратном скролле они строятся заново из уже загруженного
// S.messages (в самой истории на диске/MAM ничего не выгружается - выгрузка
// касается только смонтированных DOM-узлов).
//
// Компенсация scrollTop нужна только для операций, меняющих контент ВЫШЕ
// видимой области (и вставка, и выгрузка сверху) - см. growWindowUp/
// growWindowDown ниже: каждая возвращает { pre, win }, где pre - окно ПОСЛЕ
// вставки, но ДО подрезки противоположного края, чтобы вызывающий код
// (render-messages.js) смонтировал вставку и подрезку двумя раздельными
// проходами и посчитал компенсацию только для той стороны, которая
// действительно потребовала её (см. комментарий у ensureScrollListener).
const WINDOW_SIZE = 100;      // размер окна при первом открытии чата/прыжке
const MAX_WINDOW_SIZE = 100;  // общий потолок размера окна при скролле
const GROW_STEP = 30;         // на сколько строк раздвигаем/подрезаем окно у края
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
// решает, как смонтировать результат growWindowUp/growWindowDown (обе
// стороны теперь могут требовать компенсации scrollTop - см. их комментарии).
export function growDirection(chatJid, planLength, el){
  const win = windowByChat.get(chatJid);
  if(!win) return null;
  if(win.top > 0 && el.scrollTop < EDGE_THRESHOLD_PX) return 'up';
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if(win.bottom < planLength - 1 && distanceToBottom < EDGE_THRESHOLD_PX) return 'down';
  return null;
}

// Раздвигает окно вверх (к старым сообщениям) на GROW_STEP и, если итоговый
// размер превысил MAX_WINDOW_SIZE, подрезает СНИЗУ на столько же строк -
// старый хвост выгружается из DOM (см. reconcileKeyedChildren).
// Возвращает { pre, win }: pre - окно сразу после раздвижки, но ДО подрезки
// низа; win - итоговое (уже с подрезкой). Раздельно, чтобы вызывающий код
// смонтировал сначала pre (вставка сверху - требует компенсации scrollTop),
// затем win (подрезка снизу, за пределами видимой области - компенсации не
// требует) двумя проходами, не смешивая противоположные по знаку изменения
// scrollHeight в одном измерении "до/после".
export function growWindowUp(chatJid, planLength){
  const win = windowByChat.get(chatJid);
  if(!win){ const w = openWindowAtEnd(chatJid, planLength); return { pre: w, win: w }; }
  const pre = { top: Math.max(0, win.top - GROW_STEP), bottom: win.bottom };
  win.top = pre.top;
  if(win.bottom - win.top + 1 > MAX_WINDOW_SIZE){
    win.bottom = win.top + MAX_WINDOW_SIZE - 1;
  }
  clamp(win, planLength);
  return { pre, win };
}

// Симметрично growWindowUp, но вниз (к новым сообщениям): раздвигает низ,
// а при превышении MAX_WINDOW_SIZE подрезает СВЕРХУ - выгрузка старой
// головы окна теперь требует такой же компенсации scrollTop, как вставка
// сверху (контент выше видимой области исчезает - оставшееся "подъезжает"
// вверх, если не компенсировать). pre здесь - окно сразу после раздвижки
// низа, ДО подрезки верха, по той же причине раздельного монтирования.
export function growWindowDown(chatJid, planLength){
  const win = windowByChat.get(chatJid);
  if(!win){ const w = openWindowAtEnd(chatJid, planLength); return { pre: w, win: w }; }
  const pre = { top: win.top, bottom: Math.min(planLength - 1, win.bottom + GROW_STEP) };
  win.bottom = pre.bottom;
  if(win.bottom - win.top + 1 > MAX_WINDOW_SIZE){
    win.top = win.bottom - MAX_WINDOW_SIZE + 1;
  }
  clamp(win, planLength);
  return { pre, win };
}
