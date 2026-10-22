// ===================== net/trusted-contacts.js =====================
// «Доверенный контакт» для автозагрузки картинок (riedchat-security-plan.md, п.5): privacy-решение,
// не крипто-состояние (как omemo.chatSupport[bare]). Хранится в localStorage как lastSeen/nickMap
// (core/last-seen-storage.js), отдельно на аккаунт.
//
// Контакт становится доверенным:
//  - вручную через add-modal (addContact() в net/roster.js) - явное действие;
//  - после TRUST_MESSAGE_THRESHOLD ИСХОДЯЩИХ сообщений - эвристика "не одноразовый спам-джид".
//
// Счётчик учитывает только исходящие: иначе спамер сам обходил бы порог, прислав несколько сообщений.
// Исходящие подделать нельзя - их порождает только действие пользователя.
import { accountMap } from '../core/storage.js';

const TRUST_MESSAGE_THRESHOLD = 5;
const trusted = accountMap('xmppTrustedContacts');
const counts = accountMap('xmppContactMessageCount');

export const isTrustedContact = (bareJid) => !!trusted.all()[bareJid];

// Явное доверие - при ручном добавлении контакта (net/roster.js:addContact); сразу trusted, без порога.
export const markContactTrusted = (bareJid) => { if(bareJid) trusted.set(bareJid, true); };

// Счётчик ИСХОДЯЩИХ сообщений контакту: вызывается из net/messaging/outgoing/send.js после успешной
// отправки. Входящие не считаются (см. шапку файла). По достижении TRUST_MESSAGE_THRESHOLD контакт
// помечается доверенным один раз, дальше счётчик не нужен.
export function bumpOutgoingMessageCount(bareJid){
  if(!bareJid || isTrustedContact(bareJid)) return;
  const n = (counts.all()[bareJid] || 0) + 1;
  if(n >= TRUST_MESSAGE_THRESHOLD){
    counts.delete(bareJid);
    markContactTrusted(bareJid);
  } else {
    counts.set(bareJid, n);
  }
}
