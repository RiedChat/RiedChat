// ===================== crypto/omemo/envelope.js =====================
// SCE-конверт (XEP-0420): omemo:2 шифрует XML-конверт, а не голый текст.
import { escapeHtml } from '../../core/safe-html.js';
import * as B from '../bytes.js';

import { omemo } from './state.js';

Object.assign(omemo, {
  // ---------- SCE-конверт (XEP-0420) ----------
  // Без конверта спек-совместимые клиенты (Conversations, Gajim) не прочитают <payload>.
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
    // Affix <from> сверяем с реальным отправителем станзы (проверен через SessionCipher).
    // Несовпадение - шифротекст переупакован под другим отправителем (XEP-0384/XEP-0420).
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
