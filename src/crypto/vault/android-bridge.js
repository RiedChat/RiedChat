// ===================== crypto/vault/android-bridge.js =====================
// android-native: мост к AndroidKeyStore (см. VaultKeystoreBridge.java).
// Ключ живёт в AndroidKeyStore и никогда не попадает в JS вообще, наружу
// идут только plaintext/ciphertext конкретной операции; каждая операция
// гейтована биометрией/PIN через BiometricPrompt.CryptoObject.
import { debugLog } from '../../core/debug-log.js';
import { uuid } from '../../core/uuid.js';
import { t } from '../../i18n/t.js';

const ANDROID_BRIDGE_TIMEOUT_MS = 30000; // биометрия/PIN может ждать ввода пользователя дольше обычного таймаута

export function androidNativeSupported(){
  try{
    return !!(window.AndroidVaultBridge && typeof window.AndroidVaultBridge.isAvailable === 'function'
      && window.AndroidVaultBridge.isAvailable());
  }catch(e){
    debugLog('[vault] androidNativeSupported: ' + e.message);
    return false;
  }
}

export function androidNativeDeleteKey(){
  if(window.AndroidVaultBridge && typeof window.AndroidVaultBridge.deleteKey === 'function'){
    try{ window.AndroidVaultBridge.deleteKey(); }
    catch(e){ debugLog('[vault] AndroidVaultBridge.deleteKey: ' + e.message); }
  }
}

// Единый реестр ожидающих запросов к мосту: native-сторона зовёт
// window.__androidVaultCallback(requestId, success, ivB64, dataB64, plaintextUtf8, errorMessage)
// из VaultKeystoreBridge.respondEncryptSuccess/respondDecryptSuccess/respondError.
const androidPending = new Map();
window.__androidVaultCallback = function(requestId, success, ivB64, dataB64, plaintextUtf8, errorMessage){
  const entry = androidPending.get(requestId);
  if(!entry) return; // таймаут уже отработал и запись убрана - поздний ответ игнорируем
  androidPending.delete(requestId);
  clearTimeout(entry.timeoutId);
  if(success) entry.resolve({ ivB64, dataB64, plaintextUtf8 });
  else entry.reject(new Error(errorMessage || t('vault.errors.androidBridgeUnknownError')));
};

function androidBridgeCall(fn){
  return new Promise((resolve, reject) => {
    const requestId = uuid();
    const timeoutId = setTimeout(() => {
      androidPending.delete(requestId);
      reject(new Error(t('vault.errors.androidBridgeTimeout')));
    }, ANDROID_BRIDGE_TIMEOUT_MS);
    androidPending.set(requestId, { resolve, reject, timeoutId });
    try{
      fn(requestId);
    }catch(e){
      androidPending.delete(requestId);
      clearTimeout(timeoutId);
      reject(e);
    }
  });
}

export async function androidNativeEncrypt(obj){
  const plaintext = JSON.stringify(obj);
  const { ivB64, dataB64 } = await androidBridgeCall(
    requestId => window.AndroidVaultBridge.encrypt(plaintext, requestId));
  return { v: 1, iv: ivB64, data: dataB64 };
}

export async function androidNativeDecrypt(blob){
  const { plaintextUtf8 } = await androidBridgeCall(
    requestId => window.AndroidVaultBridge.decrypt(blob.iv, blob.data, requestId));
  return JSON.parse(plaintextUtf8);
}
