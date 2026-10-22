// ===================== core/storage.js =====================
// Хелперы localStorage: чтение с fallback и запись с вытеснением кэшей.
import { t } from '../i18n/t.js';

import { debugLog, errMsg } from './debug-log.js';
import { toast } from './dom-utils.js';
import { isQuotaError } from './idb.js';
import { state } from './state.js';

// fallback, если ключа нет, JSON битый или localStorage недоступен.
export function lsGet(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }catch{ return fallback; }
}

function freeLocalStorageSpace(exceptKey){
  const keys = Object.keys(localStorage)
    .filter(k => k !== exceptKey && k.startsWith('xmppContactAvatar_'));
  keys.forEach(k => localStorage.removeItem(k));
  return keys.length > 0;
}

export function lsSetStrict(key, value){
  const raw = JSON.stringify(value);
  try{
    localStorage.setItem(key, raw);
  }catch(e){
    if(!isQuotaError(e) || !freeLocalStorageSpace(key)) throw e;
    localStorage.setItem(key, raw);
  }
}

export function lsSet(key, value){
  try{ lsSetStrict(key, value); return true; }
  catch{ return false; }
}

export function lsRemove(key){
  // Недоступность localStorage не критична: удалять нечего.
  try{ localStorage.removeItem(key); }catch{}
}

// Ключ с привязкой к аккаунту (state.myBareJid): настройки/кэши не смешиваются между аккаунтами.
export function accountKey(prefix){
  return prefix + '_' + (state.myBareJid || '');
}

// Одно значение в localStorage под accountKey(name): get() - прочитать, set(value) - записать; null/undefined удаляет ключ.
export const accountValue = (name, fallback = null) => ({
  get: () => lsGet(accountKey(name), fallback),
  set: (value) => value == null ? lsRemove(accountKey(name)) : lsSet(accountKey(name), value),
});

// Карта jid -> значение в localStorage под accountKey(name): all() - вся карта, set/delete - точечная правка
// (read-modify-write, возвращает результат lsSet).
export const accountMap = (name) => {
  const write = (mutate) => {
    const map = lsGet(accountKey(name), {});
    mutate(map);
    return lsSet(accountKey(name), map);
  };
  return {
    all: () => lsGet(accountKey(name), {}),
    set: (key, value) => write(m => { m[key] = value; }),
    delete: (key) => write(m => { delete m[key]; }),
  };
};

// Открывает IndexedDB с таймаутом: если другая вкладка держит старую версию, апгрейд блокируется и ни один
// колбэк не срабатывает - промис отклоняется через 8 секунд.
// opts: onUpgrade(db) - создать object store'ы;
//       label + lockedMessage - при onblocked: лог '[label] ...' и тост lockedMessage;
//       timeoutMessage - текст ошибки таймаута.
export function openIndexedDb(dbName, version, {onUpgrade, label, lockedMessage, timeoutMessage} = {}){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    // Опоздавшее соединение закрываем (повторный resolve/reject игнорируется).
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(timeoutMessage || t('common.dbTimeoutFallback', {dbName})));
    }, 8000);

    req.onblocked = () => {
      if(!label) return;
      debugLog(label + ' indexedDB.open("' + dbName + '") заблокирован - есть другое открытое соединение к базе (другая вкладка/сессия этого чата)');
      if(lockedMessage) toast(lockedMessage);
    };
    req.onupgradeneeded = () => onUpgrade?.(req.result);
    req.onsuccess = () => {
      clearTimeout(timer);
      if(timedOut) req.result.close();
      else resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(timer);
      reject(req.error);
    };
  });
}

// Удаляет базу. Всегда резолвится: true - удалена, false - ошибка или заблокирована другой вкладкой.
export const deleteIndexedDb = (dbName) => new Promise((resolve) => {
  const req = indexedDB.deleteDatabase(dbName);
  req.onsuccess = () => resolve(true);
  req.onerror = () => {
    debugLog('[idb] не удалось удалить ' + dbName + ': ' + errMsg(req.error));
    resolve(false);
  };
  req.onblocked = () => {
    debugLog('[idb] удаление ' + dbName + ' заблокировано другой вкладкой');
    resolve(false);
  };
});
