// ===================== store.js =====================
// Хранилище идентичности/сессий OMEMO поверх IndexedDB, интерфейс для libsignal-protocol.js.
// SignalStore - один плоский объект: методы identity-store, prekey-store, session-store
// подмешиваются в прототип, данные хранятся в idb (idb-kv).
import { deleteIndexedDb } from '../core/storage.js';
import { promptVaultPassphrase } from '../ui/vault-modal.js';

import { IdbKv, EncryptedIdbKv, openOmemoDb } from './idb-kv.js';
import { identityMethods } from './identity-store.js';
import { getOmemoStorageKey, forgetKey } from './omemo-vault.js';
import { preKeyMethods } from './prekey-store.js';
import { sessionMethods } from './session-store.js';

class SignalStore{
  constructor(idb, bareJid){
    this.idb = idb;
    this.ns = 'omemo:' + bareJid + ':';
    // libsignal читает storage.Direction.SENDING/RECEIVING при построении сессии.
    // Значение игнорируется (чистый TOFU), но свойство обязано существовать.
    this.Direction = { SENDING: 1, RECEIVING: 2 };
  }
  // Ключ: ns + kind + ':' + id (без id - префикс для keys/entries).
  _k(kind, id = ''){ return this.ns + kind + ':' + id; }
  _get(kind, id){ return this.idb.get(this._k(kind, id)); }
  _set(kind, id, value){ return this.idb.set(this._k(kind, id), value); }
  _del(kind, id){ return this.idb.del(this._k(kind, id)); }
}

Object.assign(SignalStore.prototype, identityMethods, preKeyMethods, sessionMethods);

const dbNameFor = (bareJid) => 'omemoDb_' + bareJid.replace(/[^a-zA-Z0-9]/g, '_');

// Открытые соединения по имени базы: deleteSignalStore закрывает своё без обращения
// к omemo.store (иначе циклический импорт с omemo/state.js).
const openDbs = new Map();

export async function createSignalStore(bareJid){
  const dbName = dbNameFor(bareJid);
  const db = await openOmemoDb(dbName);
  openDbs.set(dbName, db);
  const rawIdb = new IdbKv(db);
  // Ключи identity/prekey/session шифруются data-key'ом под vault'ом (см. omemo-vault.js)
  // независимо от rememberMe.
  const storageKey = await getOmemoStorageKey(bareJid, promptVaultPassphrase);
  const idb = new EncryptedIdbKv(rawIdb, storageKey);
  return new SignalStore(idb, bareJid);
}

// Полностью удаляет базу OMEMO-ключей аккаунта (logout "с концами", ui/modals.js).
// Открытое соединение закрываем первым, иначе удаление блокируется.
export function deleteSignalStore(bareJid){
  const dbName = dbNameFor(bareJid);
  openDbs.get(dbName)?.close();
  openDbs.delete(dbName);
  // Зашифрованный data-key переживает удаление IndexedDB - убираем явно.
  forgetKey('omemoKeys', bareJid);
  return deleteIndexedDb(dbName);
}
