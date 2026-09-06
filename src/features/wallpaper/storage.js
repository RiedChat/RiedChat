// ===================== features/wallpaper/storage.js =====================
// Хранение обоев чата (localStorage, на аккаунт).
import { accountKey, lsGet, lsRemove, lsSet } from '../../core/storage.js';

export function loadWallpaper(){
  return lsGet(accountKey('xmppWallpaper'), null);
}

export function saveWallpaper(wallpaper){
  const key = accountKey('xmppWallpaper');
  if(wallpaper) lsSet(key, wallpaper);
  else lsRemove(key);
}
