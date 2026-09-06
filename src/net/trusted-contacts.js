// ===================== net/trusted-contacts.js =====================
// «Доверенный контакт» для автозагрузки картинок (riedchat-security-plan.md,
// п.5): аналог omemo.chatSupport[bare], но для privacy-решения, а не для
// крипто-состояния. Персистится в localStorage тем же способом, что и
// lastSeen/nickMap (см. core/last-seen-storage.js) - отдельно на каждый
// аккаунт, чтобы не утекало между разными логинами на одном устройстве.
//
// Контакт становится доверенным двумя путями:
//  - пользователь добавил его вручную через add-modal (см. addContact()
//    в net/roster.js) - явное действие пользователя, этого достаточно;
//  - накопилось достаточно сообщений в переписке (в любую сторону) - минимальная
//    эвристика "это не одноразовый спам-джид, прислали одну ссылку и
//    исчезли", TRUST_MESSAGE_THRESHOLD ниже.
import { lsGet, lsSet, accountKey } from '../core/storage.js';

const TRUST_MESSAGE_THRESHOLD = 5;

function loadTrustedMap(){
  return lsGet(accountKey('xmppTrustedContacts'), {});
}
function saveTrustedMap(map){
  lsSet(accountKey('xmppTrustedContacts'), map);
}
function loadCountMap(){
  return lsGet(accountKey('xmppContactMessageCount'), {});
}
function saveCountMap(map){
  lsSet(accountKey('xmppContactMessageCount'), map);
}

export function isTrustedContact(bareJid){
  if(!bareJid) return false;
  return !!loadTrustedMap()[bareJid];
}

// Явное доверие - вызывается при ручном добавлении контакта пользователем
// (net/roster.js:addContact). Действие пользователя весомее счётчика
// сообщений, поэтому сразу выставляет trusted без ожидания порога.
export function markContactTrusted(bareJid){
  if(!bareJid) return;
  const map = loadTrustedMap();
  if(!map[bareJid]){
    map[bareJid] = true;
    saveTrustedMap(map);
  }
}

// Счётчик сообщений с контактом (в обе стороны) - вызывается из
// net/messaging/incoming.js и net/messaging/outgoing.js после каждого
// добавления сообщения в S.messages. По достижении TRUST_MESSAGE_THRESHOLD
// контакт помечается доверенным один раз и дальше счётчик не нужен.
export function bumpContactMessageCount(bareJid){
  if(!bareJid || isTrustedContact(bareJid)) return;
  const counts = loadCountMap();
  counts[bareJid] = (counts[bareJid] || 0) + 1;
  if(counts[bareJid] >= TRUST_MESSAGE_THRESHOLD){
    delete counts[bareJid];
    saveCountMap(counts);
    markContactTrusted(bareJid);
  } else {
    saveCountMap(counts);
  }
}
