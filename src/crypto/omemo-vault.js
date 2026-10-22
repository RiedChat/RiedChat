// ===================== crypto/omemo-vault.js =====================
// Общий с учёткой зашифрованный блок в localStorage (LS_KEY, core/constants.js):
// { account: {wsUrl,jid,password}|null, omemoKeys: { [bareJid]: rawKeyB64 } }.
// OMEMO data-key'и (idb-kv.js:EncryptedIdbKv) лежат в том же блоке, что и учётка,
// и шифруются одним vault.encrypt/decrypt.
//
// Причина (БАГ исправлен): при отдельном ключе ('xmppOmemoStorageKey:'+bareJid) и отдельном vault-вызове
// режим 'android-native' давал BiometricPrompt на каждый вызов (ключ в AndroidKeyStore, в JS не кэшируется):
// на логин с "запомнить на устройстве" выходило два промпта, а при пропуске второго OMEMO тихо не
// инициализировался (catch в bootstrap.js глотал ошибку). Теперь один блок и один вызов (flushVaultBlob,
// один раз из connect.js после правок учётки и OMEMO-ключа) - один BiometricPrompt на логин.
//
// Data-key не шифруется на каждую операцию с IndexedDB (десятки вызовов на сообщение): один раз получив его
// из vault-блока, держим в памяти вкладки как non-extractable CryptoKey (memCache)
// и шифруем записи OMEMO kv без промптов.
import { LS_KEY } from '../core/constants.js';
import { state } from '../core/state.js';
import { lsGet, lsSetStrict } from '../core/storage.js';

import * as bytes from './bytes.js';
import { vault } from './vault.js';


const memCache = new Map(); // bareJid -> CryptoKey
let dirty = false;

const emptyBlob = () => ({ account: null, omemoKeys: {}, historyKeys: {} });

// Выводит ключ vault (создаёт режим при первом обращении) - общий пролог операций с vault-блоком.
async function unlockVault(passphraseProvider){
  await vault.ensureSetup(passphraseProvider);
  return vault.unlock(passphraseProvider);
}

const newRawKeyB64 = () => bytes.b64FromBuf(bytes.randomBytes(32));
const importAesKey = (rawKeyB64) => crypto.subtle.importKey(
  'raw', bytes.bufFromB64(rawKeyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

// Удаляет data-key из памяти и из неймспейса vault-блока (field: 'omemoKeys'/'historyKeys'), без записи на диск.
// Используется при logout/deleteAllForAccount (net/history.js) и store.js:deleteSignalStore: logout (ui/modals.js)
// сам удаляет весь LS_KEY и делает location.reload(), лишний encrypt означал бы ненужный BiometricPrompt при выходе.
export function forgetKey(field, bareJid){
  memCache.delete(memKeyOf(field, bareJid));
  delete state.vaultBlob?.[field]?.[bareJid];
}

// Зашифрованная запись имеет форму {v:1, iv, data} (encryptOmemoValue). Остальное - legacy, отдаём как есть.
export const isEncryptedRecord = (v) =>
  v?.v === 1 && typeof v.iv === 'string' && typeof v.data === 'string';

// Старый формат - {wsUrl,jid,password} прямо в LS_KEY. Распознаём по 'jid' и конвертируем при чтении.
const normalizeBlob = (raw) => ({ ...emptyBlob(), ...raw });

// Расшифровывает общий vault-блок не чаще раза за сессию (кэш в state.vaultBlob).
// Если LS_KEY на диске нет - заводит пустой блок в памяти, без vault и биометрии.
export async function getVaultBlob(passphraseProvider){
  if(state.vaultBlob) return state.vaultBlob;
  const raw = lsGet(LS_KEY, null);
  const data = isEncryptedRecord(raw) ? await vault.decrypt(await unlockVault(passphraseProvider), raw) : null;
  return (state.vaultBlob = normalizeBlob(data));
}

export function markVaultBlobDirty(){ dirty = true; }

// Пишет весь блок (учётка + OMEMO data-key'и) одним vault.encrypt. Без изменений с последней записи
// ничего не делает - можно вызывать после каждого шага без лишнего биометрического промпта.
export async function flushVaultBlob(passphraseProvider){
  if(!dirty || !state.vaultBlob) return;
  const key = await unlockVault(passphraseProvider);
  const blob = await vault.encrypt(key, state.vaultBlob);
  // lsSetStrict бросает при неудаче (квота). dirty сбрасывается только после успешной записи:
  // иначе data-key истории жил бы только в памяти при зашифрованной на диске истории,
  // и после перезапуска расшифровка падала, а переписка обнулялась.
  lsSetStrict(LS_KEY, blob);
  dirty = false;
}

// Неймспейсы data-key'ев в vault-блоке: поле блока, ключ memCache (у истории префикс 'hist:'
// против коллизий с OMEMO-ключом того же bareJid).
const memKeyOf = (field, bareJid) => field + ':' + bareJid;

// Возвращает сырой data-key аккаунта bareJid из неймспейса vault-блока (omemoKeys/historyKeys),
// создавая при необходимости, но без записи на диск (пишет flushVaultBlob).
// migrate(bareJid, passphraseProvider) - необязательный источник ключа со старой схемы, пробуется до генерации нового.
async function ensureRawKey(field, bareJid, passphraseProvider){
  const blob = await getVaultBlob(passphraseProvider);
  if(!blob[field][bareJid]){
    blob[field][bareJid] = newRawKeyB64();
    markVaultBlobDirty();
  }
  return blob[field][bareJid];
}

// То же + импорт в non-extractable CryptoKey и кэш в memCache.
async function getDataKey(field, bareJid, passphraseProvider){
  const memKey = memKeyOf(field, bareJid);
  if(memCache.has(memKey)) return memCache.get(memKey);
  const rawKeyB64 = await ensureRawKey(field, bareJid, passphraseProvider);
  await flushVaultBlob(passphraseProvider);
  const cryptoKey = await importAesKey(rawKeyB64);
  memCache.set(memKey, cryptoKey);
  return cryptoKey;
}

// passphraseProvider - тот же (isSetup) => Promise<string>, что у vault.unlock/ensureSetup (net/connection/connect.js).
// Вызывается из store.js:createSignalStore после connect.js: блок обычно загружен, ключ в нём - обращения к vault нет.
//
// Только сырой ключ, без CryptoKey и записи на диск - для connect.js, который сам один раз вызывает flushVaultBlob.
export const ensureOmemoRawKey = (bareJid, p) => ensureRawKey('omemoKeys', bareJid, p);
export const getOmemoStorageKey = (bareJid, p) => getDataKey('omemoKeys', bareJid, p);
export const getHistoryStorageKey = (bareJid, p) => getDataKey('historyKeys', bareJid, p);

export { encrypt as encryptOmemoValue, decrypt as decryptOmemoValue } from './vault/crypto-ops.js';
