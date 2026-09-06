// ===================== crypto/vault/webauthn.js =====================
// webauthn: ключ выводится из WebAuthn PRF-расширения
// (github.com/w3c/webauthn/wiki/Explainer:-PRF-extension) - требует
// подтверждения биометрией/PIN аутентификатора на каждый вызов.
// Основной путь в обычном браузере (не в Android-обёртке).
import { b64enc, b64dec } from './base64.js';
import { t } from '../../i18n/t.js';

const RP_ID = location.hostname;
const PRF_INPUT = new TextEncoder().encode('riedchat-vault-prf-v1');
const HKDF_SALT = new TextEncoder().encode('riedchat-vault-hkdf-v1');

export function webauthnSupported(){
  return !!(window.PublicKeyCredential && navigator.credentials);
}

// Регистрирует WebAuthn-креденшл только ради PRF (resident key/passkey
// сам по себе не нужен - мы не аутентифицируем им пользователя на сервере).
export async function registerWebauthn(username){
  const cred = await navigator.credentials.create({
    publicKey: {
      rp: { id: RP_ID, name: 'RiedChat' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: username || 'riedchat',
        displayName: username || 'RiedChat',
      },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { userVerification: 'required' },
      extensions: { prf: {} },
    },
  });
  const ext = cred.getClientExtensionResults();
  if(!ext.prf || !ext.prf.enabled) throw new Error(t('vault.errors.webauthnPrfUnsupported'));
  return b64enc(cred.rawId);
}

export async function deriveKeyFromPrf(credentialIdB64){
  const assertion = await navigator.credentials.get({
    publicKey: {
      rpId: RP_ID,
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: b64dec(credentialIdB64) }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: PRF_INPUT } } },
    },
  });
  const ext = assertion.getClientExtensionResults();
  const secret = ext.prf && ext.prf.results && ext.prf.results.first;
  if(!secret) throw new Error(t('vault.errors.webauthnNoPrfSecret'));
  const hkdfKey = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new TextEncoder().encode('riedchat-aes-key') },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
