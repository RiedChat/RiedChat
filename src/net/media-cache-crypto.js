// ===================== net/media-cache-crypto.js =====================
// Шифрование содержимого постоянного кэша расшифрованных медиа (object
// store 'mediaCache', схема - см. net/history/db.js) на диске, AES-256-GCM.
// Раньше расшифрованные фото/видео/голосовые лежали в IndexedDB открытым
// текстом (в отличие от OMEMO-ключей и учётки, которые уже шифровались vault-
// ключом, см. crypto/omemo-vault.js) - любой, кто получил доступ к профилю
// браузера/устройству, мог прочитать все когда-либо просмотренные вложения
// без знания пароля приложения.
//
// Отдельный модуль без импорта crypto/omemo-vault.js (тот тянет
// crypto/vault.js/core/state.js - DOM/BiometricPrompt/WebAuthn), потому что
// используется из ДВУХ разных контекстов исполнения:
//   - net/history/media-cache.js  - главный поток
//   - net/media-worker/media-worker.js - отдельный module Worker, у которого
//     нет доступа к UI для запроса passphrase/биометрии; воркер получает уже
//     готовый CryptoKey один раз через postMessage (см.
//     net/media/worker-client.js:sendCacheKey) и просто использует его.
// `data`/`iv` кладутся в IndexedDB как есть (ArrayBuffer/Uint8Array,
// структурно клонируемые), без base64 - это не localStorage, лишняя
// сериализация только замедлила бы запись больших видеофайлов.

export async function encryptCacheEntry(key, blob){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await blob.arrayBuffer();
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv, data };
}

export async function decryptCacheEntry(key, rec){
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, key, rec.data);
  return new Blob([plaintext], { type: rec.kind || '' });
}
