// ===================== crypto/vault/passphrase.js =====================
// passphrase: ключ из пароль-фразы через PBKDF2-SHA256 (600k итераций, OWASP 2023+).
import * as bytes from '../bytes.js';

import { deriveAesGcmKey } from './crypto-ops.js';

export const PBKDF2_ITERATIONS = 600000;

export async function deriveKeyFromPassphrase(passphrase, saltB64, iterations){
  const salt = saltB64 ? bytes.bufFromB64(saltB64) : bytes.randomBytes(16).buffer;
  const baseKey = await crypto.subtle.importKey('raw', bytes.utf8ToBuf(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await deriveAesGcmKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iterations || PBKDF2_ITERATIONS }, baseKey);
  return { key, salt: bytes.b64FromBuf(salt) };
}
