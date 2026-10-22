// ===================== crypto/vault/webauthn.js =====================
// webauthn: ключ из WebAuthn PRF-расширения (github.com/w3c/webauthn/wiki/Explainer:-PRF-extension),
// биометрия/PIN на каждый вызов. Основной в обычном браузере.
import { t } from '../../i18n/t.js';
import * as bytes from '../bytes.js';

import { deriveAesGcmKey } from './crypto-ops.js';

const RP_ID = location.hostname;
const PRF_INPUT = bytes.utf8ToBuf('riedchat-vault-prf-v1');
const HKDF_SALT = bytes.utf8ToBuf('riedchat-vault-hkdf-v1');

export function webauthnSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// Регистрирует WebAuthn-креденшл только ради PRF (аутентификация на сервере не нужна).
export async function registerWebauthn(username){
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { id: RP_ID, name: 'RiedChat' },
      user: {
        id: bytes.randomBytes(16),
        name: username || 'riedchat',
        displayName: username || 'RiedChat',
      },
      challenge: bytes.randomBytes(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { userVerification: 'required' },
      extensions: { prf: {} },
    },
  });
  const ext = cred.getClientExtensionResults();
  if(!ext.prf || !ext.prf.enabled) throw new Error(t('vault.errors.webauthnPrfUnsupported'));
  return bytes.b64FromBuf(cred.rawId);
}

export async function deriveKeyFromPrf(credentialIdB64){
  const assertion = await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: bytes.randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: bytes.bufFromB64(credentialIdB64) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_INPUT } } },
    },
  });
  const ext = assertion.getClientExtensionResults();
  const secret = ext.prf && ext.prf.results && ext.prf.results.first;
  if(!secret) throw new Error(t('vault.errors.webauthnNoPrfSecret'));
  const hkdfKey = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return deriveAesGcmKey({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: bytes.utf8ToBuf('riedchat-aes-key') }, hkdfKey);
}
