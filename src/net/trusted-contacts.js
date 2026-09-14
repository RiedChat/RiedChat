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
//  - пользователь сам написал контакту достаточно сообщений (только
//    ИСХОДЯЩИЕ, см. ниже) - минимальная эвристика "это не одноразовый
//    спам-джид, прислали одну ссылку и исчезли", TRUST_MESSAGE_THRESHOLD ниже.
//
// ВАЖНО: счётчик учитывает только исходящие сообщения (те, что пользователь
// САМ отправил контакту), а не входящие. Раньше счётчик рос от сообщений в
// любую сторону, из-за чего порог тривиально обходился тем самым спамером,
// от которого должен защищать: он просто присылал 5 сообщений подряд и сам
// себе выставлял доверие, не дожидаясь никакого ответа от пользователя.
// Исходящие сообщения атакующий подделать не может - их порождает только
// осознанное действие пользователя (ответ в чате), поэтому только они и
// считаются к порогу.
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

// Счётчик ИСХОДЯЩИХ сообщений контакту - вызывается из
// net/messaging/outgoing/send.js после каждой успешной отправки. Входящие
// сообщения намеренно не считаются (см. комментарий в шапке файла). По
// достижении TRUST_MESSAGE_THRESHOLD контакт помечается доверенным один раз
// и дальше счётчик не нужен.
export function bumpOutgoingMessageCount(bareJid){
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
