// ===================== crypto/omemo-vault.js =====================
// Общий с учётной записью зашифрованный блок в localStorage (LS_KEY, см.
// core/constants.js) вида { account: {wsUrl,jid,password}|null, omemoKeys:
// { [bareJid]: rawKeyB64 } } - OMEMO data-key'и (identity/prekey/session,
// см. crypto/idb-kv.js:EncryptedIdbKv) лежат в ТОМ ЖЕ блоке, что и
// сохранённая учётка, и шифруются/расшифровываются ОДНИМ вызовом
// vault.encrypt/decrypt.
//
// БАГ (исправлено): раньше у OMEMO data-key был свой отдельный localStorage-
// ключ ('xmppOmemoStorageKey:'+bareJid) и свой независимый vault.encrypt/
// decrypt-вызов - отдельный от того, что делает connect.js:persistAccount()
// для учётки. Для режима vault 'android-native' каждый такой вызов - это
// отдельный BiometricPrompt (ключ живёт в AndroidKeyStore, наружу в JS не
// отдаётся, см. vault.js), а не обычный in-memory CryptoKey, который можно
// закэшировать один раз на сессию. В сумме на логин с "запомнить на
// устройстве" выходило ДВА промпта подряд вместо одного - а если пользователь
// не успевал/не проходил второй (для OMEMO), тот тихо не инициализировался
// (catch в bootstrap.js глотал ошибку в toast), хотя сам логин по первому
// промпту уже успевал отработать. Теперь оба секрета лежат в одном блоке и
// шифруются одним вызовом (см. flushVaultBlob, дергается один раз из
// connect.js после того, как туда внесены правки И по учётке, И по OMEMO-
// ключу) - один логин с изменениями на диске = один BiometricPrompt.
//
// Сам data-key всё равно не шифруется/расшифровывается на каждую операцию с
// IndexedDB (это было бы неюзабельно - loadSession/storeSession и т.п.
// вызываются десятки раз на сообщение): после того как он один раз получен
// из vault-блока, он живёт в памяти вкладки как non-extractable CryptoKey
// (memCache) и им уже без каких-либо промптов шифруется/расшифровывается
// каждая запись OMEMO kv.
import { lsGet, lsSet, lsRemove } from '../core/storage.js';
import { vault } from './vault.js';
import { state } from '../core/state.js';
import { debugLog } from '../core/debug-log.js';
import { LS_KEY } from '../core/constants.js';

const memCache = new Map(); // bareJid -> CryptoKey
let dirty = false;

function b64enc(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64dec(str){ return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer; }

// Формат до объединения с учёткой - просто {wsUrl,jid,password} напрямую в
// LS_KEY. Распознаём по наличию 'jid' и превращаем в новый формат при чтении,
// чтобы у уже установленных клиентов ничего не потерялось.
function normalizeBlob(raw){
  if(!raw) return { account: null, omemoKeys: {} };
  if(raw.jid !== undefined || raw.wsUrl !== undefined){
    return { account: raw, omemoKeys: {} };
  }
  return { account: raw.account || null, omemoKeys: raw.omemoKeys || {} };
}

// Расшифровывает общий vault-блок не чаще одного раза за сессию - результат
// кэшируется в state.vaultBlob. Если LS_KEY ещё нет на диске (первый запуск
// / rememberMe ни разу не включали и OMEMO ещё не инициализировался) -
// просто заводит пустой блок в памяти, никакого похода к vault и биометрии.
export async function getVaultBlob(passphraseProvider){
  if(state.vaultBlob) return state.vaultBlob;
  const raw = lsGet(LS_KEY, null);
  if(!raw || !raw.data || !raw.iv){
    state.vaultBlob = { account: null, omemoKeys: {} };
    return state.vaultBlob;
  }
  await vault.ensureSetup(null, passphraseProvider);
  const key = await vault.unlock(passphraseProvider);
  const decrypted = await vault.decrypt(key, raw);
  state.vaultBlob = normalizeBlob(decrypted);
  return state.vaultBlob;
}

export function markVaultBlobDirty(){ dirty = true; }

// Пишет ВЕСЬ блок (учётка + все OMEMO data-key'и) одним вызовом vault.encrypt.
// Ничего не делает, если с момента последней записи (или загрузки) ничего не
// поменяли - вызывать можно смело хоть после каждого шага, лишний
// биометрический промпт от этого не появится.
export async function flushVaultBlob(passphraseProvider){
  if(!dirty || !state.vaultBlob) return;
  await vault.ensureSetup(null, passphraseProvider);
  const key = await vault.unlock(passphraseProvider);
  const blob = await vault.encrypt(key, state.vaultBlob);
  lsSet(LS_KEY, blob);
  dirty = false;
}

// Возвращает (создавая при необходимости, но НЕ записывая на диск - это
// делает flushVaultBlob) сырой data-key OMEMO-хранилища аккаунта bareJid.
//
// БАГ (исправлено): на устройствах, где OMEMO уже был инициализирован ДО
// объединения хранилища (ключ лежал отдельно под 'xmppOmemoStorageKey:'+
// bareJid - см. историю этого файла), простое "не нашли в новом блоке -
// сгенерировали новый" привело бы к рассинхрону: в IndexedDB (identity/
// prekey/session) уже лежат записи, зашифрованные СТАРЫМ ключом, а читать их
// стали бы новым - crypto.subtle.decrypt падает с DOMException OperationError
// (провал проверки тега GCM), в bootstrap.js это всплывало как toast "OMEMO
// недоступен: ошибка инициализации ключей - OperationError". Поэтому сначала
// пробуем мигрировать ключ со старого места, и только если там пусто -
// генерируем новый.
export async function ensureOmemoRawKey(bareJid, passphraseProvider){
  const blob = await getVaultBlob(passphraseProvider);
  let rawKeyB64 = blob.omemoKeys[bareJid];
  if(!rawKeyB64){
    rawKeyB64 = await migrateLegacyOmemoRawKey(bareJid, passphraseProvider);
    if(!rawKeyB64){
      rawKeyB64 = b64enc(crypto.getRandomValues(new Uint8Array(32)).buffer);
      debugLog('[omemo-vault] сгенерирован новый data-key для OMEMO-хранилища ' + bareJid);
    }
    blob.omemoKeys[bareJid] = rawKeyB64;
    markVaultBlobDirty();
  }
  return rawKeyB64;
}

function legacyOmemoKeyLsKey(bareJid){ return 'xmppOmemoStorageKey:' + bareJid; }

async function migrateLegacyOmemoRawKey(bareJid, passphraseProvider){
  const legacyLsKey = legacyOmemoKeyLsKey(bareJid);
  const legacyBlob = lsGet(legacyLsKey, null);
  if(!legacyBlob || !legacyBlob.data || !legacyBlob.iv) return null;
  try{
    await vault.ensureSetup(null, passphraseProvider);
    const vaultKey = await vault.unlock(passphraseProvider);
    const decrypted = await vault.decrypt(vaultKey, legacyBlob);
    lsRemove(legacyLsKey);
    debugLog('[omemo-vault] мигрирован OMEMO data-key со старой схемы хранения для ' + bareJid);
    return decrypted.rawKeyB64;
  }catch(e){
    debugLog('[omemo-vault] не удалось мигрировать старый OMEMO data-key для ' + bareJid + ': ' + (e && e.message ? e.message : e));
    return null;
  }
}

// passphraseProvider - тот же (isSetup) => Promise<string>, что принимают
// vault.unlock/ensureSetup (см. вызовы в net/connection/connect.js). К этому
// моменту (вызывается из crypto/store.js:createSignalStore, уже после
// net/connection/connect.js) блок обычно уже загружен и нужный ключ уже в
// нём - тогда это чистый locally-cached путь без единого похода к vault.
export async function getOmemoStorageKey(bareJid, passphraseProvider){
  if(memCache.has(bareJid)) return memCache.get(bareJid);
  const rawKeyB64 = await ensureOmemoRawKey(bareJid, passphraseProvider);
  // Если ключ только что сгенерирован и по какой-то причине это не часть
  // обычного connect.js-флоу (где flushVaultBlob вызывается явно один раз
  // после всех правок) - подстрахуемся и сохраним сами, чтобы новый ключ не
  // потерялся при перезагрузке страницы.
  await flushVaultBlob(passphraseProvider);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', b64dec(rawKeyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  memCache.set(bareJid, cryptoKey);
  return cryptoKey;
}

export async function encryptOmemoValue(key, val){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(val));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { v: 1, iv: b64enc(iv), data: b64enc(ciphertext) };
}

export async function decryptOmemoValue(key, blob){
  const iv = new Uint8Array(b64dec(blob.iv));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64dec(blob.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// Удаляет data-key конкретного аккаунта из памяти и из общего vault-блока -
// используется при полном удалении OMEMO-базы (см. store.js:deleteSignalStore).
// Только в памяти, без записи на диск: единственный вызывающий (logout в
// ui/modals.js) сам уже удаляет весь LS_KEY целиком и делает location.reload()
// сразу следом - лишний encrypt-вызов тут означал бы ещё один ненужный
// BiometricPrompt прямо при выходе, только чтобы тут же быть стёртым.
export function forgetOmemoStorageKey(bareJid){
  memCache.delete(bareJid);
  if(state.vaultBlob && state.vaultBlob.omemoKeys){
    delete state.vaultBlob.omemoKeys[bareJid];
  }
}
