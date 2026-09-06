// ===================== net/history.js =====================
// Публичный фасад history - постоянное хранение истории переписки
// (S.messages) и кэша медиа в IndexedDB, отдельно от OMEMO-хранилища ключей
// (crypto/store.js). Сам код разбит на:
//   - net/media-cache-shared.js   - общая логика кэша медиа (используется
//                                    также из net/media-worker/media-worker.js)
//   - net/history/db.js           - открытие/схема/удаление базы
//   - net/history/threads.js      - сообщения (threads) и служебные данные (meta)
//   - net/history/media-cache.js  - обёртка над media-cache-shared.js
// Здесь - только состояние (db, dbName) и делегирование к этим модулям, чтобы
// внешний API (history.saveThread(...) и т.п.) не менялся для остального
// кода (features/*, net/mam.js, net/media.js и т.д.).
import { toast } from '../core/dom-utils.js';
import { debugLog } from '../core/debug-log.js';
import { t } from '../i18n/t.js';
import { dbNameFor, openDb } from './history/db.js';
import * as historyThreads from './history/threads.js';
import * as historyMediaCache from './history/media-cache.js';

export const history = {
  db: null,
  dbName: null, // имя текущей IndexedDB-базы - нужно net/media-worker/media-worker.js, чтобы открыть ту же базу из воркера
  _writeErrorWarned: false,

  // Единая точка для ошибок записи (saveThread/putMediaEntry и т.п.), которые
  // раньше молча глотались через `.catch(e => console.warn(...))` - например,
  // переполнение квоты IndexedDB могло означать, что сообщения формально
  // "отправлены", но на самом деле не сохраняются на устройстве, а
  // пользователь никак об этом не узнавал. Тост показываем один раз за
  // сессию, чтобы не спамить при каждом следующем сообщении.
  reportWriteError(e, context){
    console.warn('не удалось сохранить ' + context + ' в IndexedDB', e);
    debugLog('[history] ошибка записи (' + context + '): ' + (e && e.message ? e.message : e));
    if(this._writeErrorWarned) return;
    this._writeErrorWarned = true;
    const isQuota = e && (e.name === 'QuotaExceededError' || /quota/i.test((e && e.message) || ''));
    toast(isQuota
      ? t('history.noSpace')
      : t('history.saveFailed', {context, detail: e && e.message ? e.message : e}));
  },

  async init(bareJid){
    this.dbName = dbNameFor(bareJid);
    this.db = await openDb(bareJid);
    return this.db;
  },

  loadAll(){ return historyThreads.loadAll(this.db); },
  saveThread(jid, messages){ return historyThreads.saveThread(this.db, jid, messages); },
  clearThread(jid){ return historyThreads.clearThread(this.db, jid); },
  clearAll(){ return historyThreads.clearAll(this.db); },
  getMeta(key){ return historyThreads.getMeta(this.db, key); },
  setMeta(key, val){ return historyThreads.setMeta(this.db, key, val); },

  getMediaEntry(url){ return historyMediaCache.getMediaEntry(this.db, url); },
  putMediaEntry(url, blob, kind){ return historyMediaCache.putMediaEntry(this.db, url, blob, kind); },
  evictMediaCache(){ return historyMediaCache.evictMediaCache(this.db); },
  clearMediaCache(){ return historyMediaCache.clearMediaCache(this.db); },

  // ---- полное удаление истории конкретного аккаунта с устройства (выход "с концами") ----
  // В отличие от clearThread/clearAll (которые чистят содержимое, но оставляют базу
  // открытой и на месте), тут закрываем соединение и удаляем саму IndexedDB-базу
  // целиком - после этого следующий вход под этим же JID начнётся с нуля.
  deleteAllForAccount(bareJid){
    // db.close() на уже закрытом/сброшенном соединении может бросить - не
    // страшно, this.db всё равно обнуляется строкой ниже, а deleteDatabase()
    // ниже так и так снесёт базу целиком.
    try{ if(this.db){ this.db.close(); } }catch(e){}
    this.db = null;
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(dbNameFor(bareJid));
      req.onsuccess = () => resolve(true);
      req.onerror = () => {
        debugLog('[history] не удалось удалить базу истории: ' + (req.error && req.error.message));
        resolve(false);
      };
      req.onblocked = () => {
        // Обычно значит, что где-то ещё (другая вкладка) держит эту базу открытой.
        debugLog('[history] удаление базы истории заблокировано - есть другое открытое соединение (другая вкладка с этим чатом)');
        resolve(false);
      };
    });
  }
};

// history доступна через `import { history } from './history.js'` - все
// текущие потребители (net/mam.js, net/connection/bootstrap.js) уже
// переведены на реальный import, поэтому window.App-мост здесь не нужен.
