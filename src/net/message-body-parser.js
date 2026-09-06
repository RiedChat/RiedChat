// ===================== net/message-body-parser.js =====================
// Общий разбор тела сообщения из <message>-элемента (живого или вложенного
// в MAM <forwarded>): расшифровка OMEMO либо plain-<body>/fileUrl. Раньше
// этот код был продублирован в net/mam.js:processArchivedMessage и
// net/messaging/incoming.js:onMessage - оба куска легко расходились при правке
// только одного из них (например, извлечение fileUrl).
import { omemo } from '../crypto/omemo/state.js';

// Ищет в станзе ссылку на вложение: сначала XEP-0066/0363 (<x xmlns='jabber:x:oob'>
// либо голый <url>), затем XEP-0447/reference source. Разрешает и обычные
// https-ссылки (XEP-0363), и aesgcm:// (XEP-0454, зашифрованные вложения -
// Conversations присылает именно такие). Раньше жила в net/messaging.js (до
// разбиения на net/messaging/incoming.js и net/messaging/outgoing.js) как
// App.xmpp.extractFileUrl - перенесена сюда, т.к. используется только вместе
// с parseMessageBody (и живым onMessage, и MAM-разбором из net/mam.js).
// Разрешённые схемы вложений - единственное место, где эта проверка
// должна жить: и oobUrl, и sources ниже обязаны идти через неё, иначе
// fileUrl может стать URL с произвольной схемой (javascript:/data: и т.п.),
// и мы полагаемся только на повторную проверку downstream в
// ui/chat-view/message-body-html.js:classifySingleMedia - то есть на
// хрупкий defense-in-depth в другом файле вместо собственной валидации.
const ALLOWED_URL_SCHEME_RE = /^(https?|aesgcm):\/\//;

export function extractFileUrl(stanza){
  const oobUrl = stanza.querySelector('x[xmlns="jabber:x:oob"] url, url');
  const oobText = oobUrl && Strophe.getText(oobUrl);
  if(oobText && ALLOWED_URL_SCHEME_RE.test(oobText)) return oobText;
  const sources = stanza.querySelectorAll('reference source, file-sharing url, url');
  for(const s of sources){
    const u = Strophe.getText(s);
    if(u && ALLOWED_URL_SCHEME_RE.test(u)) return u;
  }
  return null;
}

// Возвращает {body, encrypted} либо null, если сообщение нужно пропустить
// (например, OMEMO-конверт адресован другому нашему устройству - decryptStanza
// тогда вернёт null, и это НЕ ошибка, а штатный сценарий).
export async function parseMessageBody(el){
  const encEl = el.querySelector('encrypted');
  if(encEl){
    let plain = null;
    try{ plain = await omemo.decryptStanza(el); }
    catch(e){ console.warn('parseMessageBody: ошибка расшифровки', e); }
    if(plain === null) return null;
    return { body: plain, encrypted: true };
  }
  const bodyEl = el.querySelector('body');
  let body = bodyEl ? Strophe.getText(bodyEl) : '';
  const fileUrl = extractFileUrl(el);
  if(fileUrl && !body.includes(fileUrl)) body = fileUrl;
  return { body, encrypted: false };
}
