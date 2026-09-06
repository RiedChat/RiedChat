// ===================== crypto/omemo/envelope.js =====================
// SCE-конверт (XEP-0420), которого требует профиль настоящего omemo:2 -
// шифруется не голый текст, а этот XML-конверт вокруг него.
import { escapeHtml } from '../../core/dom-utils.js';
import { bytes as B } from '../bytes.js';
import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- SCE-конверт (XEP-0420), профиль которого требует omemo:2 ----------
  // Настоящий omemo:2 шифрует не голый текст, а такой XML-конверт - без него
  // спек-совместимые клиенты (Conversations, Gajim и т.п.) не смогут прочитать
  // сообщение, т.к. ожидают именно SCE-обёртку внутри <payload>.
  _buildSceEnvelope(bodyText, fromBareJid){
    const rpadBytes = B.randomBytes(1 + Math.floor(Math.random() * 200));
    const rpadB64 = B.b64FromBuf(rpadBytes);
    const xml = `<envelope xmlns="urn:xmpp:sce:1">` +
      `<content><body xmlns="jabber:client">${escapeHtml(bodyText)}</body></content>` +
      `<rpad>${rpadB64}</rpad>` +
      `<time stamp="${new Date().toISOString()}"/>` +
      `<from jid="${fromBareJid}"/>` +
      `</envelope>`;
    return B.utf8ToBuf(xml);
  },
  _parseSceEnvelope(bytes, expectedFromBareJid){
    const xmlStr = B.bufToUtf8(bytes);
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    if(doc.querySelector('parsererror')) throw new Error('SCE-конверт: битый XML после расшифровки');
    // Affix-элемент <from> - сверяем с реальным отправителем стансы (уже проверенным
    // на уровне decryptStanza через SessionCipher/Double Ratchet). Несовпадение значит,
    // что кто-то (сервер, посредник) переупаковал шифротекст под другим отправителем -
    // именно от такой подмены и защищает этот affix по XEP-0384/XEP-0420.
    if(expectedFromBareJid){
      const fromEl = doc.querySelector('envelope > from');
      const claimedFrom = fromEl ? fromEl.getAttribute('jid') : null;
      if(claimedFrom !== expectedFromBareJid){
        throw new Error('SCE-конверт: <from jid="' + claimedFrom + '"> не совпадает с реальным отправителем ' + expectedFromBareJid);
      }
    }
    const bodyEl = doc.querySelector('content > body');
    return bodyEl ? bodyEl.textContent : '';
  },
});
