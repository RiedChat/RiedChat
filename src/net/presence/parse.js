// =================== net/presence/parse.js ===================
// Чистые функции разбора <presence/> (без DOM/state). Из net/presence/incoming.js.
import { NS_NICK, NS_VCARD_UPDATE } from '../../core/constants.js';

// XEP-0172: псевдоним контакта в presence.
export const parseNick = (stanza) =>
  stanza.getElementsByTagNameNS(NS_NICK, 'nick')[0]?.textContent.trim().slice(0, 60) || null;

// XEP-0153: <x xmlns='vcard-temp:x:update'><photo>SHA1</photo></x> - хэш аватара контакта.
// '' - аватар снят, null - элемента нет в станзе.
export function parseVcardHash(stanza){
  const x = stanza.getElementsByTagNameNS(NS_VCARD_UPDATE, 'x')[0];
  if(!x) return null;
  return (x.querySelector('photo')?.textContent || '').trim();
}
