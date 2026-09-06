// ===================== store.js =====================
// Хранилище идентичности/сессий OMEMO поверх IndexedDB.
// Реализует интерфейс, который ожидает libsignal-protocol.js:
// getIdentityKeyPair, getLocalRegistrationId, isTrustedIdentity, saveIdentity,
// loadPreKey/storePreKey/removePreKey, loadSignedPreKey/storeSignedPreKey,
// loadSession/storeSession.
//
// Сам класс - тонкая композиция трёх модулей (см. crypto/idb-kv.js,
// crypto/identity-store.js, crypto/prekey-store.js, crypto/session-store.js):
// вся реальная логика лежит там, а SignalStore просто делегирует вызовы,
// чтобы наружу (и для libsignal, и для остального приложения) сохранялся
// один плоский объект с методами, как и раньше.
import { IdbKv, EncryptedIdbKv, openOmemoDb } from './idb-kv.js';
import { IdentityStore } from './identity-store.js';
import { PreKeyStore } from './prekey-store.js';
import { SessionStore } from './session-store.js';
import { getOmemoStorageKey, forgetOmemoStorageKey } from './omemo-vault.js';
import { promptVaultPassphrase } from '../ui/vault-modal.js';
// Циклический импорт с omemo/state.js (тот импортирует createSignalStore
// отсюда): в ES-модулях это допустимо через живые биндинги, пока к omemo
// не обращаются на этапе загрузки модуля - deleteSignalStore читает его
// только внутри своего тела, которое вызывается уже после того, как оба
// модуля полностью проинициализированы.
import { omemo } from './omemo/state.js';
import { debugLog } from '../core/debug-log.js';

// Копирует все методы прототипа source на target, привязывая их к
// instance (source остаётся владельцем состояния и логики).
function delegate(target, instance){
  const proto = Object.getPrototypeOf(instance);
  for(const name of Object.getOwnPropertyNames(proto)){
    if(name === 'constructor') continue;
    if(typeof instance[name] !== 'function') continue;
    target[name] = instance[name].bind(instance);
  }
  return target;
}

class SignalStore{
  constructor(idb, bareJid){
    this.idb = idb;
    this.ns = 'omemo:' + bareJid + ':';

    this.identity = new IdentityStore(idb, this.ns);
    this.prekeys = new PreKeyStore(idb, this.ns);
    this.sessions = new SessionStore(idb, this.ns);
    delegate(this, this.identity);
    delegate(this, this.prekeys);
    delegate(this, this.sessions);

    // libsignal-protocol.js дёргает this.storage.Direction.SENDING / .RECEIVING
    // при построении сессии (SessionBuilder.processPreKey и processV3), чтобы
    // передать направление в isTrustedIdentity. Само значение мы игнорируем
    // (наша isTrustedIdentity работает по чистому TOFU без учёта направления),
    // но само свойство обязано существовать - иначе падает с
    // "Cannot read properties of undefined (reading 'SENDING')".
    this.Direction = { SENDING: 1, RECEIVING: 2 };
  }
}

export async function createSignalStore(bareJid){
  const db = await openOmemoDb('omemoDb_' + bareJid.replace(/[^a-zA-Z0-9]/g,'_'));
  const rawIdb = new IdbKv(db);
  // См. crypto/omemo-vault.js: identity/prekey/session-ключи шифруются
  // data-key'ом, который сам защищён vault'ом (тем же, что и сохранённые
  // учётные данные) - независимо от того, включил ли пользователь
  // "запомнить на устройстве" при логине (persistAccount вызывается только
  // при rememberMe, а OMEMO-ключи защищать нужно в любом случае).
  const storageKey = await getOmemoStorageKey(bareJid, (isSetup) => promptVaultPassphrase(isSetup));
  const idb = new EncryptedIdbKv(rawIdb, storageKey);
  return new SignalStore(idb, bareJid);
}

// Полное удаление базы OMEMO-ключей аккаунта с устройства (используется при
// выходе "с концами" - см. ui/modals.js logout()). Если хранилище этой сессии
// ещё открыто (omemo.store), сперва закрываем соединение - иначе браузер
// заблокирует удаление до закрытия всех хендлов на эту базу.
export function deleteSignalStore(bareJid){
  const dbName = 'omemoDb_' + bareJid.replace(/[^a-zA-Z0-9]/g,'_');
  try{
    if(omemo && omemo.store && omemo.store.idb && omemo.store.idb.db){
      omemo.store.idb.db.close();
    }
  }catch(e){
    // Уже закрытое соединение при повторном close() может бросить - не
    // критично, indexedDB.deleteDatabase() ниже снесёт базу в любом случае.
  }
  // Зашифрованный data-key переживает удаление IndexedDB, если его не
  // убрать явно - а без соответствующей базы он бесполезен и просто
  // копится в localStorage от старых аккаунтов.
  forgetOmemoStorageKey(bareJid);
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve(true);
    req.onerror = () => {
      debugLog('[omemo-store] не удалось удалить базу ключей: ' + (req.error && req.error.message));
      resolve(false);
    };
    req.onblocked = () => {
      debugLog('[omemo-store] удаление базы ключей заблокировано - есть другое открытое соединение (другая вкладка с этим чатом)');
      resolve(false);
    };
  });
}
