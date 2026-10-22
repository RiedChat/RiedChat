// ===================== net/message-body-parser.js =====================
// Разбор тела <message>: расшифровка OMEMO либо plain-<body>/fileUrl.
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';

// Ищет в станзе ссылку на вложение: XEP-0066/0363 (<x xmlns='jabber:x:oob'><url> или голый <url>)
// и XEP-0447 (reference source). Принимает https (XEP-0363) и aesgcm:// (XEP-0454).
// Проверка схемы - единственная: и oobUrl, и sources обязаны идти через неё, иначе fileUrl может
// получить произвольную схему (javascript:/data:), и защита останется только в
// ui/chat-view/message-body-html.js:classifySingleMedia.
const ALLOWED_URL_SCHEME_RE = /^(https?|aesgcm):\/\//;

function extractFileUrl(stanza){
  for(const el of stanza.querySelectorAll('url, reference source')){
    const u = Strophe.getText(el);
    if(u && ALLOWED_URL_SCHEME_RE.test(u)) return u;
  }
  return null;
}

// Возвращает {body, encrypted} или null, если сообщение пропускаем
// (OMEMO-конверт для другого нашего устройства: decryptStanza вернёт null - штатный случай).
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

// parseMessageBody + защиты для живых сообщений и исправлений (XEP-0308): null, если разбирать
// нечего - адресовано другому нашему устройству, пустое тело или расшифрованное сообщение,
// которое мы сами отправили себе для синхронизации (bare === наш bare JID).
export async function parseIncomingBody(stanza, bare){
  const parsed = await parseMessageBody(stanza);
  if(!parsed || !parsed.body) return null;
  if(parsed.encrypted && bare === state.myBareJid) return null;
  return parsed;
}
