// ===================== crypto/vault/crypto-ops.js =====================
// Шифрование/расшифровка объектов ключом vault (AES-GCM-256 для webauthn/passphrase, android-native - через android-bridge.js).
import * as bytes from '../bytes.js';

import { isAndroidKey, androidNativeEncrypt, androidNativeDecrypt } from './android-bridge.js';

// Производный AES-GCM-256 ключ (неизвлекаемый, encrypt/decrypt) из baseKey по параметрам KDF (PBKDF2 - passphrase.js, HKDF - webauthn.js).
export const deriveAesGcmKey = (kdfParams, baseKey) =>
  crypto.subtle.deriveKey(kdfParams, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

export async function encrypt(key, obj){
  if(isAndroidKey(key)) return androidNativeEncrypt(obj);
  const { iv, data } = await bytes.aesGcmEncrypt(key, bytes.utf8ToBuf(JSON.stringify(obj)));
  return { v: 1, iv: bytes.b64FromBuf(iv), data: bytes.b64FromBuf(data) };
}

export async function decrypt(key, blob){
  if(isAndroidKey(key)) return androidNativeDecrypt(blob);
  const iv = new Uint8Array(bytes.bufFromB64(blob.iv));
  const plaintext = await bytes.aesGcmDecrypt(key, iv, bytes.bufFromB64(blob.data));
  return JSON.parse(bytes.bufToUtf8(plaintext));
}
