// ===================== net/vcard.js =====================
// XMPP-протокол vCard (XEP-0153/vcard-temp): публикация своей vCard, запрос чужой, обновление кэша аватара,
// рассылка профиля. Хранение - net/vcard-storage.js.
import { NS_VCARD } from '../core/constants.js';
import { debugLog, errMsg } from '../core/debug-log.js';
import { dataUrlOf } from '../core/image-utils.js';
import { sendIqSafe } from '../core/iq.js';
import { state } from '../core/state.js';
import * as bytes from '../crypto/bytes.js';
import { t } from '../i18n/t.js';
import { renderChatHead } from '../ui/chat-head.js';
import { renderRoster } from '../ui/roster.js';

import { broadcastPresence } from './presence/caps.js';
import { profileStore, contactAvatarStore } from './vcard-storage.js';


const sha1HexFromB64 = async (b64) =>
  bytes.bytesToHex(await crypto.subtle.digest('SHA-1', bytes.bufFromB64(b64)));

// ---------- ПУБЛИКАЦИЯ СВОЕЙ vCard (XEP-0153/vcard-temp) ----------
// photoB64=== null очищает фото, саму vCard не удаляет (иначе часть серверов вернёт item-not-found).
async function publishOwnVCard(photoB64, photoType){
  if(!state.connection?.connected) throw new Error(t('vcard.noConnection'));
  const iq = $iq({type: 'set', id: 'vcard-set-' + Date.now()}).c('vCard', {xmlns: NS_VCARD});
  if(photoB64) iq.c('PHOTO').c('TYPE').t(photoType || 'image/jpeg').up().c('BINVAL').t(photoB64);
  if(!await sendIqSafe(iq)) throw new Error(t('vcard.updateRejected'));
}

// ---------- ЗАПРОС ЧУЖОЙ vCard (её фото) ----------
async function fetchVCardAvatar(jid){
  if(!state.connection?.connected) return null;
  const iq = $iq({type: 'get', to: jid, id: 'vcard-get-' + Date.now()})
    .c('vCard', {xmlns: NS_VCARD});
  const res = await sendIqSafe(iq);
  if(!res) return null;
  const photo = res.querySelector('PHOTO');
  const b64 = photo?.querySelector('BINVAL')?.textContent?.replace(/\s+/g, '');
  if(!b64) return null;
  return {photoB64: b64, photoType: photo.querySelector('TYPE')?.textContent || 'image/jpeg'};
}

// Скачивает и кэширует аватар контакта после анонса нового хэша в его presence (onPresence, net/presence/incoming.js).
export async function refreshContactAvatar(jid, hash){
  try{
    const result = await fetchVCardAvatar(jid);
    if(!result || !result.photoB64) return;
    // photoType/photoB64 - недоверенный ввод от СОБЕСЕДНИКА. dataUrl подставляется в src="..." (ui/roster.js,
    // ui/chat-head.js): `"` / `<` в TYPE или BINVAL позволили бы вырваться из атрибута и внедрить HTML/script.
    // Разрешаем только синтаксически безопасный MIME (image/xxx) и base64-алфавит, остальное - отбрасываем.
    const safeType = /^image\/[a-z0-9.+-]+$/i.test(result.photoType) ? result.photoType : 'image/jpeg';
    const safeB64 = /^[A-Za-z0-9+/=]*$/.test(result.photoB64) ? result.photoB64 : null;
    if(!safeB64){
      debugLog('[avatar] vCard ' + jid + ' содержит невалидный base64 в BINVAL - аватар отклонён');
      return;
    }
    const dataUrl = dataUrlOf(safeB64, safeType);
    state.roster[jid] ??= {};
    state.roster[jid].avatarUrl = dataUrl;
    contactAvatarStore.set(jid, {hash, dataUrl});
    renderRoster();
    if(state.activeChat === jid) renderChatHead();
  }catch(e){
    debugLog('[avatar] не удалось получить vCard ' + jid + ': ' + errMsg(e));
  }
}

// ---------- РАССЫЛКА СВОЕГО ПРОФИЛЯ ----------
// Публикует (или очищает) vCard и пересчитывает photoHash. Вызывается из features/profile/modal.js после сохранения профиля.
export async function applyProfile(profile){
  await publishOwnVCard(profile.photoB64 || null, profile.photoType);
  profile.photoHash = profile.photoB64 ? await sha1HexFromB64(profile.photoB64) : '';
  profileStore.set(profile);
  broadcastPresence();
}
