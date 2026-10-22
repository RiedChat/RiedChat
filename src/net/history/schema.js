// ===================== net/history/schema.js =====================
// Схема IndexedDB истории: версия и object store'ы. Модуль без импортов - его используют
// и главный поток (history.js), и воркер (media-worker.js), который не может импортировать history.js (тянет state и i18n).
export const DB_VERSION = 3;
// v3: добавлено хранилище 'mediaCache' (расшифрованные медиа-blob'ы по URL).
const DB_STORES = ['threads', 'meta', 'mediaCache'];

// Для onupgradeneeded: доводит базу до актуальной схемы, не трогая 'threads'/'meta' версий 1/2.
export function upgradeSchema(db){
  DB_STORES.forEach(name => {
    if(!db.objectStoreNames.contains(name)) db.createObjectStore(name);
  });
}

export const dbNameFor = (bareJid) => 'chatHistory_' + bareJid.replace(/[^a-zA-Z0-9]/g, '_');
