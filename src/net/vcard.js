// ===================== net/vcard.js =====================
// XMPP-протокол vCard (XEP-0153/vcard-temp): публикация своей vCard,
// запрос чужой, обновление кэша аватара контакта, рассылка своего профиля.
// Хранение профиля/кэша - в net/vcard-storage.js.
import { IQ_TIMEOUT_MS, NS_VCARD } from '../core/constants.js';
import { _parseXml, escapeHtml } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { bytes } from '../crypto/bytes.js';
import { debugLog } from '../core/debug-log.js';
import { t } from '../i18n/t.js';
import { saveProfile, persistContactAvatar } from './vcard-storage.js';
import { broadcastPresence } from './presence/caps.js';
import { renderRoster } from '../ui/roster.js';
import { renderChatHead } from '../ui/chat-head.js';

const S = state;

async function sha1HexFromB64(b64){
  const buf = bytes.bufFromB64(b64);
  const digest = await crypto.subtle.digest('SHA-1', buf);
  return bytes.bytesToHex(digest);
}

// ---------- ПУБЛИКАЦИЯ СВОЕЙ vCard (XEP-0153/vcard-temp) ----------
// photoB64=== null очищает фото в vCard (но не удаляет саму vCard - так
// безопаснее для серверов, которые иначе могут вернуть item-not-found).
export function publishOwnVCard(photoB64, photoType){
  return new Promise((resolve, reject) => {
    if(!S.connection || !S.connection.connected){ reject(new Error(t('vcard.noConnection'))); return; }
    const photoXml = photoB64
      ? `<PHOTO><TYPE>${escapeHtml(photoType || 'image/jpeg')}</TYPE><BINVAL>${photoB64}</BINVAL></PHOTO>`
      : '';
    const iq = $iq({type: 'set', id: 'vcard-set-' + Date.now()})
      .c('vCard', {xmlns: NS_VCARD});
    if(photoXml) iq.cnode(_parseXml(photoXml));
    S.connection.sendIQ(iq,
      () => resolve(),
      () => reject(new Error(t('vcard.updateRejected'))),
      IQ_TIMEOUT_MS);
  });
}

// ---------- ЗАПРОС ЧУЖОЙ vCard (её фото) ----------
export function fetchVCardAvatar(jid){
  return new Promise((resolve) => {
    if(!S.connection || !S.connection.connected){ resolve(null); return; }
    const iq = $iq({type: 'get', to: jid, id: 'vcard-get-' + Date.now()})
      .c('vCard', {xmlns: NS_VCARD});
    S.connection.sendIQ(iq,
      (res) => {
        const photoEl = res.querySelector('PHOTO');
        const binEl = photoEl && photoEl.querySelector('BINVAL');
        const b64 = binEl && binEl.textContent ? binEl.textContent.replace(/\s+/g, '') : '';
        if(!b64){ resolve(null); return; }
        const typeEl = photoEl.querySelector('TYPE');
        resolve({photoB64: b64, photoType: (typeEl && typeEl.textContent) || 'image/jpeg'});
      },
      () => resolve(null),
      IQ_TIMEOUT_MS);
  });
}

// Скачивает и кэширует аватар контакта после того, как его presence
// анонсировала новый хэш (см. onPresence в net/presence/incoming.js).
export async function refreshContactAvatar(jid, hash){
  try{
    const result = await fetchVCardAvatar(jid);
    if(!result || !result.photoB64) return;
    // photoType/photoB64 приходят из vCard СОБЕСЕДНИКА - то есть это
    // недоверенный ввод. dataUrl ниже в итоге подставляется в src="..."
    // как обычная строка (ui/roster.js, ui/chat-head.js), поэтому если
    // бы TYPE или BINVAL содержали `"` / `<`, можно было бы вырваться из
    // атрибута img и вставить произвольный HTML/script - устройство
    // контакта полностью контролирует оба поля. Разрешаем только
    // безопасный по синтаксису MIME (image/xxx) и base64-алфавит,
    // остальное отбрасываем как повреждённый/вредоносный аватар.
    const safeType = /^image\/[a-z0-9.+-]+$/i.test(result.photoType) ? result.photoType : 'image/jpeg';
    const safeB64 = /^[A-Za-z0-9+/=]*$/.test(result.photoB64) ? result.photoB64 : null;
    if(!safeB64){
      debugLog('[avatar] vCard ' + jid + ' содержит невалидный base64 в BINVAL - аватар отклонён');
      return;
    }
    const dataUrl = 'data:' + safeType + ';base64,' + safeB64;
    S.roster[jid] = S.roster[jid] || {};
    S.roster[jid].avatarUrl = dataUrl;
    persistContactAvatar(jid, hash, dataUrl);
    renderRoster();
    if(S.activeChat === jid) renderChatHead();
  }catch(e){
    debugLog('[avatar] не удалось получить vCard ' + jid + ': ' + (e && e.message ? e.message : e));
  }
}

// ---------- РАССЫЛКА СВОЕГО ПРОФИЛЯ ----------
// Публикует vCard (или очищает её) и пересчитывает photoHash профиля.
// Вызывается из features/profile.js сразу после сохранения формы профиля.
export async function applyProfile(profile){
  if(profile.photoB64){
    await publishOwnVCard(profile.photoB64, profile.photoType || 'image/jpeg');
    profile.photoHash = await sha1HexFromB64(profile.photoB64);
  } else {
    await publishOwnVCard(null, null);
    profile.photoHash = '';
  }
  saveProfile(profile);
  broadcastPresence();
}

// features/profile.js уже использует реальный import { applyProfile } -
// window.App-мост здесь больше не нужен. publishOwnVCard/fetchVCardAvatar/
// refreshContactAvatar внешних потребителей за пределами этого файла и
// net/presence/incoming.js (уже мигрирован) не имеют.
