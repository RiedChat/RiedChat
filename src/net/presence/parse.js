// =================== net/presence/parse.js ===================
// Чистые функции разбора <presence/> станзы, не трогающие DOM/state.
// Выделено из net/presence/incoming.js.
import { NS_NICK, NS_VCARD_UPDATE } from '../../core/constants.js';

// XEP-0172: контакт мог указать псевдоним в presence.
export function parseNick(stanza){
  const nickEl = stanza.querySelector('nick');
  if(!nickEl || nickEl.namespaceURI !== NS_NICK) return null;
  const nick = (nickEl.textContent || '').trim().slice(0, 60);
  return nick || null;
}

// XEP-0153: <x xmlns='vcard-temp:x:update'><photo>SHA1</photo></x> - хэш
// текущего аватара контакта. Пустая строка значит "аватар снят", null -
// элемента вообще не было в станзе.
export function parseVcardHash(stanza){
  let vcardUpdateEl = null;
  const xEls = stanza.getElementsByTagName('x');
  for(let i = 0; i < xEls.length; i++){
    if(xEls[i].namespaceURI === NS_VCARD_UPDATE){ vcardUpdateEl = xEls[i]; break; }
  }
  if(!vcardUpdateEl) return null;
  const photoEl = vcardUpdateEl.querySelector('photo');
  return photoEl ? (photoEl.textContent || '').trim() : '';
}
