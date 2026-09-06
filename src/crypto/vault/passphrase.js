// ===================== crypto/vault/passphrase.js =====================
// passphrase: если ничего из более сильных режимов не поддерживается -
// ключ выводится из пароль-фразы через PBKDF2-SHA256
// (310k итераций, см. OWASP-рекомендации 2023+).
import { b64enc, b64dec } from './base64.js';

export const PBKDF2_ITERATIONS = 12000000;

export async function deriveKeyFromPassphrase(passphrase, saltB64, iterations){
  const salt = saltB64 ? b64dec(saltB64) : crypto.getRandomValues(new Uint8Array(16)).buffer;
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterations || PBKDF2_ITERATIONS },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return { key, salt: b64enc(salt) };
}
