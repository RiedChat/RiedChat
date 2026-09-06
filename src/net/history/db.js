// ===================== net/history/db.js =====================
// Открытие/схема/удаление IndexedDB-базы истории чата. Одна база на
// аккаунт - чтобы при выходе/входе под другим JID на этом же устройстве
// истории не пересекались. Хранилища: 'threads' и 'meta' (см.
// net/history/threads.js), 'mediaCache' (см. net/history/media-cache.js и
// net/media-worker.js - расшифрованные медиа-blob'ы).
import { toast } from '../../core/dom-utils.js';
import { openIndexedDb } from '../../core/storage.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

export function dbNameFor(bareJid){
  return 'chatHistory_' + bareJid.replace(/[^a-zA-Z0-9]/g, '_');
}

export function openDb(bareJid){
  const dbName = dbNameFor(bareJid);
  // v3: добавлено хранилище 'mediaCache' (расшифрованные медиа-blob'ы по URL).
  // onupgradeneeded корректно доотроит его для уже существующих на устройстве
  // баз версии 1/2, не трогая накопленные 'threads'/'meta'.
  return openIndexedDb(dbName, 3, {
    timeoutMessage: t('history.dbTimeout'),
    onBlocked(){
      debugLog('[history] indexedDB.open("' + dbName + '") заблокирован - есть другое открытое соединение к базе (другая вкладка/сессия этого чата)');
      toast && toast(t('history.dbLocked'));
    },
    onUpgrade(db){
      if(!db.objectStoreNames.contains('threads')) db.createObjectStore('threads');
      if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if(!db.objectStoreNames.contains('mediaCache')) db.createObjectStore('mediaCache');
    },
  });
}
