// ===================== net/history/threads.js =====================
// Хранение переписки (state.messages) в store 'threads' и служебных данных (напр. id последнего
// сообщения) в 'meta'. Схема базы - schema.js.
//
// Значения шифруются AES-GCM data-key'ом истории (`key`, см. crypto/omemo-vault.js:getHistoryStorageKey,
// передаётся из history.js). Ключи записей (jid/имя meta) не шифруются - по ним работает getAllKeys() в loadAll().
//
// Легаси-запись (до шифрования истории) - обычный объект/массив без обёртки {v:1, iv, data}
// (см. isEncryptedRecord) - отдаём как есть (как crypto/idb-kv.js:EncryptedIdbKv);
// следующий saveThread/setMeta перезапишет её зашифрованной.
import { debugLog, errMsg } from '../../core/debug-log.js';
import { reqToPromise, txDone } from '../../core/idb.js';
import { encryptOmemoValue, decryptOmemoValue, isEncryptedRecord } from '../../crypto/omemo-vault.js';

// Возвращает {jid: [сообщения...]} - весь архив устройства.
export async function loadAll(db, key){
  if(!db) return {};
  const store = db.transaction('threads', 'readonly').objectStore('threads');
  const [jids, vals] = await Promise.all([reqToPromise(store.getAllKeys()), reqToPromise(store.getAll())]);
  const result = {};
  for(let i = 0; i < jids.length; i++){
    const jid = jids[i];
    const val = vals[i];
    if(!isEncryptedRecord(val)){
      result[jid] = val;
      continue;
    }
    try{
      result[jid] = await decryptOmemoValue(key, val);
    }catch(e){
      debugLog('[history] не удалось расшифровать тред "' + jid + '": ' + errMsg(e));
      // НЕ подставляем []: следующий saveThread() затёр бы зашифрованную переписку пустым списком.
      // Сырую запись сохраняем в 'meta' под corrupt:<jid> (если уже есть - не трогаем), тред пропускаем.
      await backupUndecryptable(db, jid, val);
    }
  }
  return result;
}

// Резервная копия нечитаемой записи треда (неверный ключ, повреждение), чтобы перезапись
// не уничтожила единственную копию. Повторно не шифруется - запись уже зашифрована.
async function backupUndecryptable(db, jid, rawRecord){
  try{
    const tx = db.transaction('meta', 'readwrite');
    const store = tx.objectStore('meta');
    const bkKey = 'corrupt:' + jid;
    if(await reqToPromise(store.get(bkKey)) === undefined) store.put(rawRecord, bkKey);
    await txDone(tx);
  }catch(e){
    debugLog('[history] не удалось сохранить резервную копию треда "' + jid + '": ' + errMsg(e));
  }
}

async function put(db, storeName, key, value){
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value, key);
  await txDone(tx);
}

// Перезаписывает весь массив сообщений jid (fire-and-forget).
export async function saveThread(db, jid, messages, key){
  if(!db) return;
  await put(db, 'threads', jid, await encryptOmemoValue(key, messages));
}

export async function clearThread(db, jid){
  if(!db) return;
  const tx = db.transaction('threads', 'readwrite');
  tx.objectStore('threads').delete(jid);
  await txDone(tx);
}

// ---- служебные данные (напр. кэш ссылок стикеров) ----
export async function getMeta(db, key, cryptoKey){
  if(!db) return null;
  const val = (await reqToPromise(db.transaction('meta', 'readonly').objectStore('meta').get(key))) ?? null;
  if(!isEncryptedRecord(val)) return val;
  try{
    return await decryptOmemoValue(cryptoKey, val);
  }catch(e){
    debugLog('[history] не удалось расшифровать meta "' + key + '": ' + errMsg(e));
    return null;
  }
}

export async function setMeta(db, key, val, cryptoKey){
  if(!db) return;
  await put(db, 'meta', key, await encryptOmemoValue(cryptoKey, val));
}
