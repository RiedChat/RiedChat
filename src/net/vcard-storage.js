// ===================== net/vcard-storage.js =====================
// Хранение (localStorage, на аккаунт) своего профиля и кэша профилей
// контактов. Сам протокол публикации/запроса vCard - в net/vcard.js.
import { accountKey, lsGet, lsSet } from '../core/storage.js';

// ---------------- СВОЙ ПРОФИЛЬ (localStorage, на аккаунт) ----------------
// {nickname: string, photoB64: string|null, photoType: string|null, photoHash: string}
// photoHash хранится отдельно, чтобы не пересчитывать SHA-1 на каждую отправку presence.
export function loadProfile(){
  return lsGet(accountKey('xmppProfile'), null);
}
export function saveProfile(profile){
  lsSet(accountKey('xmppProfile'), profile);
}

// ---------------- КЭШ ПРОФИЛЕЙ КОНТАКТОВ (localStorage, на аккаунт) ----------------
export function persistContactNick(jid, nick){
  const key = accountKey('xmppContactNick');
  const map = lsGet(key, {});
  map[jid] = nick;
  lsSet(key, map);
}
export function loadContactNickMap(){
  return lsGet(accountKey('xmppContactNick'), {});
}

export function persistContactAvatar(jid, hash, dataUrl){
  const key = accountKey('xmppContactAvatar');
  const map = lsGet(key, {});
  map[jid] = {hash, dataUrl};
  lsSet(key, map);
}
export function loadContactAvatarMeta(jid){
  const map = lsGet(accountKey('xmppContactAvatar'), {});
  return map[jid] || null;
}
export function loadContactAvatarMap(){
  return lsGet(accountKey('xmppContactAvatar'), {});
}
export function clearContactAvatar(jid){
  const key = accountKey('xmppContactAvatar');
  const map = lsGet(key, {});
  delete map[jid];
  lsSet(key, map);
}

// net/presence/caps.js уже использует реальный import { loadProfile } -
// window.App-мост для loadProfile/saveProfile здесь больше не нужен.
