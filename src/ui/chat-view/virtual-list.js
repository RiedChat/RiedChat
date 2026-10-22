// ===================== ui/chat-view/virtual-list.js =====================
// Виртуализация списка: в DOM смонтировано окно сообщений [window.top..window.bottom] (индексы в списке сообщений; служебные строки достраивает render-messages.js:buildWindowRows).
//
// Версия на flex-direction:column-reverse (как в converse.js) откачена: семантика scrollTop не проверена в браузере, окно не сдвигалось за первые 100 строк. Используется обычный контейнер; компенсация scrollTop при довставке/выгрузке выше видимой области - growWindow в render-messages.js.
//
// Окно скользящее, не больше WINDOW_SIZE: при раздвижке у одного края противоположный подрезается на столько же строк (чанками GROW_STEP) - старые узлы выгружаются из DOM (reconcileKeyedChildren). При обратном скролле строятся заново из state.messages; история на диске не затрагивается.
const WINDOW_SIZE = 100;      // размер окна при открытии/прыжке и потолок при скролле
const GROW_STEP = 30;         // на сколько строк раздвигаем/подрезаем окно у края
const EDGE_THRESHOLD_PX = 600; // «у края» - за сколько px до конца окна подгружаем

const windowByChat = new Map(); // chatJid -> { top, bottom } (индексы в списке сообщений)

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

// Окно вокруг индекса плана - прыжок к первому непрочитанному при открытии чата.
export function openWindowAroundIndex(chatJid, planLength, index){
  const top = Math.max(0, index - Math.floor(WINDOW_SIZE / 2));
  const win = { top, bottom: Math.min(planLength - 1, top + WINDOW_SIZE - 1) };
  windowByChat.set(chatJid, win);
  return win;
}

// Окно с конца истории (открытие без непрочитанных) или подтяжка открытого окна к концу (новое сообщение, пользователь внизу).
function pinWindowToEnd(chatJid, planLength){
  const win = windowByChat.get(chatJid) || { top: 0, bottom: 0 };
  win.bottom = planLength - 1;
  win.top = Math.max(0, win.bottom - WINDOW_SIZE + 1);
  windowByChat.set(chatJid, win);
  return win;
}

// Обновление плана: у низа (или без окна) - подтянуть к концу, иначе - только подрезать под длину плана (сообщение удалено), не двигая просмотр.
export function windowForUpdate(chatJid, planLength, pinToEnd){
  const win = windowByChat.get(chatJid);
  return pinToEnd || !win ? pinWindowToEnd(chatJid, planLength) : clamp(win, planLength);
}

// Нужно ли раздвинуть окно и куда: 'up' | 'down' | null. Смотрит три числа (scrollTop/scrollHeight/clientHeight) без обращения к offsetHeight строк.
export function growDirection(chatJid, planLength, el){
  const win = windowByChat.get(chatJid);
  if(!win) return null;
  if(win.top > 0 && el.scrollTop < EDGE_THRESHOLD_PX) return 'up';
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if(win.bottom < planLength - 1 && distanceToBottom < EDGE_THRESHOLD_PX) return 'down';
  return null;
}

// Раздвигает окно в сторону dir ('up' - к старым, 'down' - к новым) на GROW_STEP; если размер превысил WINDOW_SIZE - подрезает противоположный край на столько же (reconcileKeyedChildren выгрузит узлы).
// Возвращает { pre, win }: pre - после раздвижки, до подрезки; win - итоговое. Раздельно, чтобы смонтировать двумя проходами и компенсировать только нужную сторону.
export function expandWindow(chatJid, planLength, dir){
  const win = windowByChat.get(chatJid); // growDirection вернул dir => окно есть
  const up = dir === 'up';
  const pre = up
    ? { top: Math.max(0, win.top - GROW_STEP), bottom: win.bottom }
    : { top: win.top, bottom: Math.min(planLength - 1, win.bottom + GROW_STEP) };
  win.top = pre.top;
  win.bottom = pre.bottom;
  if(win.bottom - win.top + 1 > WINDOW_SIZE){
    if(up) win.bottom = win.top + WINDOW_SIZE - 1;
    else win.top = win.bottom - WINDOW_SIZE + 1;
  }
  clamp(win, planLength);
  return { pre, win };
}
