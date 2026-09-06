// ===================== crypto/vault/crypto-ops.js =====================
// Шифрование/расшифровка произвольных объектов ключом vault (AES-GCM-256
// для webauthn/passphrase, либо делегирование в AndroidKeyStore для
// android-native - см. android-bridge.js).
import { b64enc, b64dec } from './base64.js';
import { androidNativeEncrypt, androidNativeDecrypt } from './android-bridge.js';

export async function encrypt(key, obj){
  if(key && key.__androidNative) return androidNativeEncrypt(obj);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(obj));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { v: 1, iv: b64enc(iv), data: b64enc(ciphertext) };
}

export async function decrypt(key, blob){
  if(key && key.__androidNative) return androidNativeDecrypt(blob);
  const iv = new Uint8Array(b64dec(blob.iv));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, b64dec(blob.data));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
