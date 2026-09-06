// ================= net/messaging/incoming/watermark.js =================
// Prosody (mod_mam) проставляет живым сообщениям <stanza-id xmlns='urn:xmpp:sid:0'
// by='{наш bare JID}'/> - тот же id, что потом будет отдан через MAM. Запоминаем
// его как "водяной знак": при следующем логине докачиваем из архива только то,
// что появилось ПОСЛЕ него, и никогда не запрашиваем повторно уже увиденное вживую
// (иначе повторная OMEMO-расшифровка сломала бы состояние Double Ratchet).
import { state } from '../../../core/state.js';
import { history } from '../../history.js';

const S = state;

export function applyWatermark(stanza){
  const sidEl = stanza.querySelector('stanza-id');
  if(sidEl && sidEl.getAttribute('by') === S.myBareJid && sidEl.getAttribute('id')){
    history.setMeta('mamLastId', sidEl.getAttribute('id')).catch(() => {});
  }
}
