// ===================== net/history/threads.js =====================
// Хранение и чтение переписки (state.messages) в object store 'threads',
// и служебных данных (например, id последнего синхронизированного через MAM
// сообщения) в 'meta'. Схема и открытие базы - см. net/history/db.js.

// Возвращает {jid: [сообщения...]} - весь сохранённый на этом устройстве архив.
export function loadAll(db){
  return new Promise((resolve, reject) => {
    if(!db){ resolve({}); return; }
    const out = {};
    const tx = db.transaction('threads', 'readonly');
    const req = tx.objectStore('threads').openCursor();
    req.onsuccess = (ev) => {
      const cur = ev.target.result;
      if(cur){
        out[cur.key] = cur.value;
        cur.continue();
      } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}

// Перезаписывает весь массив сообщений для конкретного jid (fire-and-forget со стороны вызывающего).
export function saveThread(db, jid, messages){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').put(messages, jid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearThread(db, jid){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').delete(jid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearAll(db){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---- служебные данные (например, id последнего синхронизированного через MAM сообщения) ----
export function getMeta(db, key){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(null); return; }
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
    req.onerror = () => reject(req.error);
  });
}

export function setMeta(db, key, val){
  return new Promise((resolve, reject) => {
    if(!db){ resolve(); return; }
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
