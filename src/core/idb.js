// ===================== core/idb.js =====================
// Обёртки IndexedDB (IDBRequest/IDBTransaction -> Promise) и проверка переполнения квоты. Без зависимостей:
// импортируется и из media-worker (через net/media-cache-shared.js), где нет state и i18n.
export const reqToPromise = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const txDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
});

export const isQuotaError = (e) => e?.name === 'QuotaExceededError';
