// ===================== core/last-seen-storage.js =====================
// Persist-утилиты для "был(а) в сети" и "на каком экране остался пользователь".
// Выделено из net/connection.js: это чистые обёртки над localStorage,
// не зависящие от S.connection и живущие отдельно от XMPP-логики.
import { lsGet, lsSet, lsRemove, accountKey } from './storage.js';

// ---------------- LAST SEEN (persisted локально, отдельно от роутера) ----------------
// Сервер не хранит для нас историю presence, поэтому "был(а) в сети" считаем
// только по факту наблюдения перехода online->offline вживую (см. net/presence/incoming.js:onPresence)
// и сохраняем в localStorage - иначе после обновления страницы отметка
// терялась бы, пока контакт снова не появится и не уйдёт из сети при нас.
export function persistLastSeen(jid, ts){
  const key = accountKey('xmppLastSeen');
  const map = lsGet(key, {});
  map[jid] = ts;
  lsSet(key, map);
}
export function loadLastSeenMap(){
  return lsGet(accountKey('xmppLastSeen'), {});
}

// ---------------- LAST SCREEN (в каком экране пользователь остался в прошлый раз) ----------------
// При следующем входе (в т.ч. автовходе с сохранённым аккаунтом) хотим сразу
// оказаться там же: если был открыт конкретный чат - открыть тот же чат
// (а не бросать в список контактов), если был в списке контактов - остаться
// в нём. Хранится отдельно на каждый аккаунт (как и lastSeen), чтобы при
// входе под другим JID на этом же устройстве не подхватить чужое состояние.
export function persistLastScreen(screen, jid){
  const key = accountKey('xmppLastScreen');
  if(screen === 'chat' && jid) lsSet(key, {screen: 'chat', jid});
  else lsSet(key, {screen: screen || 'contacts'});
}
export function loadLastScreen(){
  return lsGet(accountKey('xmppLastScreen'), null);
}
export function clearLastScreen(){
  lsRemove(accountKey('xmppLastScreen'));
}
