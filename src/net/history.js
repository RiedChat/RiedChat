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
import { getHistoryStorageKey, forgetHistoryStorageKey } from '../crypto/omemo-vault.js';
import { promptVaultPassphrase } from '../ui/vault-modal.js';
import { sendCacheKeyToWorker } from './media/worker-client.js';

// saveThread() раньше писало на диск (шифрование AES-GCM ВСЕГО массива
// сообщений треда + IndexedDB put) синхронно на КАЖДОЕ событие - новое
// сообщение, галочку "прочитано", правку. На активной переписке (или во
// время MAM-догрузки, где события идут пачками) это означало, что один и
// тот же (растущий) массив шифровался и записывался заново по нескольку
// раз в секунду, хотя реально важен только САМЫЙ ПОСЛЕДНИЙ снимок на
// момент, когда пользователь свернул вкладку/закрыл чат.
//
// Полная схема "своя IndexedDB-запись на каждое сообщение" (thread_<jid>_<msgId>)
// тут не сделана сознательно: она меняет формат хранения (миграция уже
// накопленных на устройствах записей thread-blob'ов), требует шифровать
// КАЖДОЕ сообщение отдельным IV вместо одного на весь тред, и почти не
// ускоряет типичный случай (обычная переписка - десятки-сотни, не
// миллионы сообщений на тред) - весь текущий выигрыш и так лежит в том,
// чтобы не писать ЛИШНИЙ РАЗ, а не в том, чтобы писать более гранулярно.
// Вместо этого - debounce: несколько saveThread() для одного jid подряд
// схлопываются в ОДНУ фактическую запись самого свежего состояния через
// SAVE_DEBOUNCE_MS после последнего вызова.
const SAVE_DEBOUNCE_MS = 300;

export const history = {
  db: null,
  key: null, // AES-GCM CryptoKey шифрования истории/медиа-кэша на диске (см. crypto/omemo-vault.js:getHistoryStorageKey)
  dbName: null, // имя текущей IndexedDB-базы - нужно net/media-worker/media-worker.js, чтобы открыть ту же базу из воркера
  _writeErrorWarned: false,
  // Отложенные (ещё не записанные на диск) сохранения тредов - jid -> {timer, messages, generation, waiters}.
  // waiters - те, кто вызвал saveThread() и ждёт .then()/.catch() именно
  // ФАКТИЧЕСКОЙ записи (например, message-select/delete.js), а не просто
  // постановки в очередь.
  _pendingSaves: new Map(),
  // Инкрементируется в init() - если аккаунт сменился, пока таймер
  // дебаунса ещё тикал, флаш эту отложенную запись просто отбрасывает
  // (см. _flushThread) вместо того, чтобы записать данные СТАРОГО
  // аккаунта в БД/под ключ НОВОГО.
  _saveGeneration: 0,

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
    // Новый аккаунт/пересоздание соединения - все отложенные записи,
    // запланированные ДО этого, были для прошлого db/key и писать их
    // сейчас было бы грубой ошибкой (см. _saveGeneration выше).
    this._pendingSaves.forEach(p => { if(p.timer) clearTimeout(p.timer); });
    this._pendingSaves.clear();
    this._saveGeneration++;

    this.dbName = dbNameFor(bareJid);
    this.db = await openDb(bareJid);
    try{
      // Тот же общий vault, что и у OMEMO-ключей/учётки (crypto/omemo-vault.js),
      // но в своём неймспейсе (historyKeys) - если vault уже разблокирован в
      // этой сессии (см. crypto/vault.js:unlock - кэширует state.vaultKey),
      // повторного запроса passphrase/биометрии не будет.
      this.key = await getHistoryStorageKey(bareJid, (isSetup) => promptVaultPassphrase(isSetup));
    }catch(e){
      // Без ключа читать/писать зашифрованные записи нельзя - откатываем db
      // к null, чтобы сработал уже существующий по всему history.js контракт
      // "db===null -> все методы аккуратно no-op'ают", а не падать на
      // key=null при первом же saveThread.
      try{ this.db.close(); }catch(e2){}
      this.db = null;
      this.key = null;
      throw e;
    }
    // Воркер (net/media-worker/media-worker.js) не имеет доступа к vault/UI -
    // передаём ему уже готовый CryptoKey один раз через structured clone.
    sendCacheKeyToWorker(this.key);
    return this.db;
  },

  loadAll(){ return historyThreads.loadAll(this.db, this.key); },

  // Обычный путь: НЕ пишет на диск сразу, а откладывает запись на
  // SAVE_DEBOUNCE_MS - если за это время придёт ещё один saveThread() для
  // того же jid (типичный случай - несколько сообщений/галочек подряд),
  // они схлопнутся в одну фактическую запись самого свежего messages.
  // Возвращаемый промис резолвится/реджектится по РЕЗУЛЬТАТУ этой
  // фактической записи - существующие вызовы `.catch(...)`/`await` по
  // всему коду продолжают работать как раньше, просто сама запись
  // происходит чуть позже и реже.
  saveThread(jid, messages){
    let pending = this._pendingSaves.get(jid);
    if(!pending){
      pending = { timer: null, messages: null, generation: this._saveGeneration, waiters: [] };
      this._pendingSaves.set(jid, pending);
    }
    // "Выигрывает" всегда последний вызов - messages это ссылка на текущий
    // S.messages[jid], так что более ранний вызов не теряет данные: к
    // моменту фактической записи мы и так видим самый свежий снимок.
    pending.messages = messages;
    pending.generation = this._saveGeneration;
    if(!pending.timer){
      pending.timer = setTimeout(() => { this._flushThread(jid); }, SAVE_DEBOUNCE_MS);
    }
    return new Promise((resolve, reject) => { pending.waiters.push({resolve, reject}); });
  },

  // Обходит дебаунс - для мест, где запись и так ОДНА на целую пачку
  // изменений (массовое удаление сообщений, MAM-догрузка целого треда), и
  // лишние SAVE_DEBOUNCE_MS ожидания перед тем, как отпустить await
  // вызывающего кода, только вредят отзывчивости UI, ничего не выигрывая
  // (тут и так нечего схлопывать - вызов один).
  saveThreadNow(jid, messages){
    const pending = this._pendingSaves.get(jid);
    if(pending && pending.timer) clearTimeout(pending.timer);
    this._pendingSaves.delete(jid);
    return historyThreads.saveThread(this.db, jid, messages, this.key).then(
      () => { if(pending) pending.waiters.forEach(w => w.resolve()); },
      (e) => { if(pending) pending.waiters.forEach(w => w.reject(e)); throw e; },
    );
  },

  // Немедленно проводит уже ЗАПЛАНИРОВАННУЮ debounce-запись (если она
  // есть) - используется при уходе со страницы (см. подписку ниже), чтобы
  // не потерять последние SAVE_DEBOUNCE_MS изменений, которые ещё не
  // успели долежать до собственного таймера.
  flushThread(jid){ return this._flushThread(jid); },
  flushAllThreads(){
    return Promise.all([...this._pendingSaves.keys()].map(jid => this._flushThread(jid)));
  },

  _flushThread(jid){
    const pending = this._pendingSaves.get(jid);
    if(!pending) return Promise.resolve();
    this._pendingSaves.delete(jid);
    if(pending.timer) clearTimeout(pending.timer);
    if(pending.generation !== this._saveGeneration){
      // Аккаунт сменился, пока эта запись ждала своего дебаунса (см.
      // init()) - db/key сейчас принадлежат уже ДРУГОМУ аккаунту, писать
      // в него данные прошлого нельзя. Это не ошибка вызывавшего кода
      // (он не мог знать про смену аккаунта), поэтому resolve, а не reject.
      pending.waiters.forEach(w => w.resolve());
      return Promise.resolve();
    }
    return historyThreads.saveThread(this.db, jid, pending.messages, this.key).then(
      () => pending.waiters.forEach(w => w.resolve()),
      (e) => { pending.waiters.forEach(w => w.reject(e)); throw e; },
    );
  },

  clearThread(jid){
    // Отменяем отложенную запись ДЛЯ ЭТОГО jid - иначе она могла бы
    // сработать чуть позже и молча "воскресить" на диске данные, которые
    // пользователь только что явно попросил стереть.
    const pending = this._pendingSaves.get(jid);
    if(pending){ if(pending.timer) clearTimeout(pending.timer); this._pendingSaves.delete(jid); pending.waiters.forEach(w => w.resolve()); }
    return historyThreads.clearThread(this.db, jid);
  },
  clearAll(){
    this._pendingSaves.forEach(p => { if(p.timer) clearTimeout(p.timer); p.waiters.forEach(w => w.resolve()); });
    this._pendingSaves.clear();
    return historyThreads.clearAll(this.db);
  },
  getMeta(key){ return historyThreads.getMeta(this.db, key, this.key); },
  setMeta(key, val){ return historyThreads.setMeta(this.db, key, val, this.key); },

  hasMediaEntry(url){ return historyMediaCache.hasMediaEntry(this.db, url); },
  getMediaEntry(url){ return historyMediaCache.getMediaEntry(this.db, url, this.key); },
  putMediaEntry(url, blob, kind){ return historyMediaCache.putMediaEntry(this.db, url, blob, kind, this.key); },
  evictMediaCache(){ return historyMediaCache.evictMediaCache(this.db); },
  clearMediaCache(){ return historyMediaCache.clearMediaCache(this.db); },

  // ---- полное удаление истории конкретного аккаунта с устройства (выход "с концами") ----
  // В отличие от clearThread/clearAll (которые чистят содержимое, но оставляют базу
  // открытой и на месте), тут закрываем соединение и удаляем саму IndexedDB-базу
  // целиком - после этого следующий вход под этим же JID начнётся с нуля.
  deleteAllForAccount(bareJid){
    // Как и в clearAll() - иначе отложенная запись могла бы сработать уже
    // ПОСЛЕ deleteDatabase() и молча пересоздать базу с прошлыми данными.
    this._pendingSaves.forEach(p => { if(p.timer) clearTimeout(p.timer); p.waiters.forEach(w => w.resolve()); });
    this._pendingSaves.clear();
    this._saveGeneration++;
    // db.close() на уже закрытом/сброшенном соединении может бросить - не
    // страшно, this.db всё равно обнуляется строкой ниже, а deleteDatabase()
    // ниже так и так снесёт базу целиком.
    try{ if(this.db){ this.db.close(); } }catch(e){}
    this.db = null;
    this.key = null;
    forgetHistoryStorageKey(bareJid);
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

// Debounce (см. SAVE_DEBOUNCE_MS выше) означает, что на момент, когда
// пользователь сворачивает вкладку/переключается в другое приложение,
// самые свежие несколько сотен миллисекунд переписки могут ещё не быть
// физически записаны на диск. document.visibilitychange->hidden надёжнее
// beforeunload на мобильных браузерах (в т.ч. iOS Safari, который часто не
// добирается до beforeunload при сворачивании) - используем именно его,
// чтобы форсировать запись отложенных тредов ДО того, как вкладку
// заморозят/выгрузят. Best-effort: если браузер убьёт процесс мгновенно,
// запись всё равно может не успеть - но это тот же риск, что и раньше был
// бы при синхронной записи, просто чуть шире окно.
if(typeof document !== 'undefined'){
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden') history.flushAllThreads().catch(() => {});
  });
}

// history доступна через `import { history } from './history.js'` - все
// текущие потребители (net/mam.js, net/connection/bootstrap.js) уже
// переведены на реальный import, поэтому window.App-мост здесь не нужен.
