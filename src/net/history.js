// ===================== net/history.js =====================
// Фасад history: постоянное хранение переписки (state.messages) и кэша медиа в IndexedDB,
// отдельно от OMEMO-ключей (crypto/store.js). Реализация:
//   - net/media-cache-shared.js - логика кэша медиа (общая с media-worker.js)
//   - net/history/schema.js     - имя базы и схема
//   - net/history/threads.js    - сообщения (threads) и meta
// Здесь - состояние (db, dbName) и делегирование; внешний API не меняется.
import { debugLog, errMsg, attempt } from '../core/debug-log.js';
import { toast } from '../core/dom-utils.js';
import { isQuotaError } from '../core/idb.js';
import { deleteIndexedDb, openIndexedDb } from '../core/storage.js';
import { getHistoryStorageKey, forgetKey } from '../crypto/omemo-vault.js';
import { t } from '../i18n/t.js';
import { promptVaultPassphrase } from '../ui/vault-modal.js';

import { dbNameFor, DB_VERSION, upgradeSchema } from './history/schema.js';
import * as historyThreads from './history/threads.js';
import { sendCacheKeyToWorker } from './media/worker-client.js';
import * as mediaCacheShared from './media-cache-shared.js';



// saveThread() - debounce: несколько вызовов для одного jid схлопываются в одну запись
// свежего состояния через SAVE_DEBOUNCE_MS (раньше каждое событие шифровало и писало весь тред).
// Запись на каждое сообщение (thread_<jid>_<msgId>) не делаем: нужна миграция формата и отдельный IV
// на сообщение, а выигрыш в типичных тредах мал.
const SAVE_DEBOUNCE_MS = 300;

const requestPersistentStorage = () => attempt('storage', 'persist() не удался', async () => {
  const granted = await navigator.storage?.persist?.();
  debugLog('[storage] persist() ' + (granted ? 'выдано' : 'отклонено браузером'));
});

export const history = {
  db: null,
  key: null,  // AES-GCM CryptoKey истории/медиа-кэша (crypto/omemo-vault.js:getHistoryStorageKey)
  dbName: null,  // имя IndexedDB-базы; нужно media-worker.js, чтобы открыть ту же базу
  _writeErrorWarned: false,
  // Отложенные записи тредов: jid -> {timer, messages} (последнее состояние сообщений).
  _pending: new Map(),

  // Единая точка ошибок записи (saveThread/putMediaEntry...), раньше глотавшихся молча
  // (напр. переполнение квоты IndexedDB). Тост - один раз за сессию.
  reportWriteError(e, context){
    console.warn('не удалось сохранить ' + context + ' в IndexedDB', e);
    debugLog('[history] ошибка записи (' + context + '): ' + errMsg(e));
    if(this._writeErrorWarned) return;
    this._writeErrorWarned = true;
    toast(isQuotaError(e)
      ? t('history.noSpace')
      : t('history.saveFailed', {context, detail: errMsg(e)}));
  },

  // Сбрасывает отложенные сохранения: гасит таймеры, запись НЕ выполняется -
  // вызывать при смене db/key или намеренном стирании.
  _dropPending(){
    this._pending.forEach(p => clearTimeout(p.timer));
    this._pending.clear();
  },

  // Запись треда с защитой от переполнения: при QuotaExceededError сносим кэш медиа (перекачается) и повторяем.
  async _writeThread(jid, messages){
    try{
      return await historyThreads.saveThread(this.db, jid, messages, this.key);
    }catch(e){
      if(!isQuotaError(e)) throw e;
      debugLog('[history] квота при записи треда "' + jid + '" - очищаем кэш медиа и повторяем');
      await this.clearMediaCache().catch(() => {});
      return historyThreads.saveThread(this.db, jid, messages, this.key);
    }
  },

  async init(bareJid){
    // Отложенные записи были для прошлого db/key - сбрасываем, чтобы их таймеры ничего не записали.
    this._dropPending();

    // Без persistent storage браузер при нехватке места может стереть весь источник (IndexedDB, стикеры, localStorage).
    requestPersistentStorage();

    // Без ключа db остаётся null (контракт history.js: db===null - методы no-op), поэтому ключ получаем до открытия базы.
    this.db = null;
    this.key = null;
    this.dbName = dbNameFor(bareJid);
    // Общий vault (crypto/omemo-vault.js) в неймспейсе historyKeys; если он разблокирован
    // (crypto/vault.js:unlock кэширует state.vaultKey), повторного запроса не будет.
    this.key = await getHistoryStorageKey(bareJid, promptVaultPassphrase);
    this.db = await openIndexedDb(this.dbName, DB_VERSION, {
      timeoutMessage: t('history.dbTimeout'),
      label: '[history]',
      lockedMessage: t('history.dbLocked'),
      onUpgrade: upgradeSchema,
    });
    // Воркер без доступа к vault/UI получает готовый CryptoKey один раз через structured clone.
    sendCacheKeyToWorker(this.key);
    return this.db;
  },

  loadAll(){ return historyThreads.loadAll(this.db, this.key); },

  // Откладывает запись на SAVE_DEBOUNCE_MS; вызовы для того же jid схлопываются.
  // now: true - без debounce, одна запись на пачку изменений (массовое удаление); промис ждёт фактической записи.
  // Ошибка записи показывается тостом (reportWriteError) и не пробрасывается; context - что не удалось сохранить.
  saveThread(jid, messages, { now = false, context } = {}){
    clearTimeout(this._pending.get(jid)?.timer);
    const timer = now ? null : setTimeout(() => this._flush(jid, context), SAVE_DEBOUNCE_MS);
    this._pending.set(jid, { timer, messages });
    if(now) return this._flush(jid, context);
  },

  async _flush(jid, context = t('history.ctxChatHistory')){
    const p = this._pending.get(jid);
    if(!p) return;
    clearTimeout(p.timer);
    this._pending.delete(jid);
    try{ await this._writeThread(jid, p.messages); }
    catch(e){ this.reportWriteError(e, context); }
  },

  // Немедленно проводит все запланированные записи - при уходе со страницы (см. подписку ниже).
  flushAllThreads(){
    return Promise.all([...this._pending.keys()].map(jid => this._flush(jid)));
  },

  clearThread(jid){
    clearTimeout(this._pending.get(jid)?.timer);
    this._pending.delete(jid);
    return historyThreads.clearThread(this.db, jid);
  },
  getMeta(key){ return historyThreads.getMeta(this.db, key, this.key); },
  setMeta(key, val){ return historyThreads.setMeta(this.db, key, val, this.key); },

  async hasMediaEntry(url){ return this.db ? mediaCacheShared.hasMediaEntry(this.db, url) : false; },
  async getMediaEntry(url){ return this.db ? mediaCacheShared.getMediaEntry(this.db, url, this.key) : null; },
  async putMediaEntry(url, blob, kind){ if(this.db) await mediaCacheShared.putMediaEntry(this.db, url, blob, kind, this.key); },
  async clearMediaCache(){ if(this.db) await mediaCacheShared.clearMediaCache(this.db); },

  // ---- полное удаление истории аккаунта с устройства ----
  // В отличие от clearThread, закрывает соединение и удаляет саму IndexedDB-базу.
  deleteAllForAccount(bareJid){
    // Иначе отложенная запись пересоздаст базу после deleteDatabase().
    this._dropPending();
    // db.close() на закрытом соединении может бросить - this.db обнуляется ниже, база всё равно удаляется.
    this.db?.close();
    this.db = null;
    this.key = null;
    forgetKey('historyKeys', bareJid);
    return deleteIndexedDb(dbNameFor(bareJid));
  }
};

// Debounce: при сворачивании вкладки последние записи могут быть не на диске.
// visibilitychange->hidden надёжнее beforeunload на мобильных (iOS Safari) - форсируем запись тут.
// Best-effort: при мгновенном убийстве процесса запись может не успеть.
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') history.flushAllThreads().catch(() => {});
});
