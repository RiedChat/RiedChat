// ===================== crypto/vault.js =====================
// Шифрование данных в localStorage (сохранённый JID/пароль; net/connection/connect.js persistAccount, ui/login-screen.js).
// Ключ AES-GCM-256 не хранится, выводится при каждой разблокировке; режимы по приоритету:
//   1) android-native: в Android-обёртке (window.AndroidVaultBridge, VaultKeystoreBridge.java) ключ в AndroidKeyStore
//      и в JS не попадает, наружу идут только plaintext/ciphertext операции под BiometricPrompt.CryptoObject.
//      Основной на Android: WebAuthn PRF в WebView не гарантирован;
//   2) webauthn: WebAuthn PRF-расширение (github.com/w3c/webauthn/wiki/Explainer:-PRF-extension),
//      биометрия/PIN на каждый вызов; основной в обычном браузере;
//   3) passphrase: PBKDF2-SHA256, 600k итераций (OWASP 2023+), если остальное недоступно.
// Режимы лежат в vault/*.js; здесь сборка объекта `vault` и выбор/переключение режима (ensureSetup/unlock).
import { debugLog } from '../core/debug-log.js';
import { state } from '../core/state.js';
import { t } from '../i18n/t.js';

import { androidNativeSupported, ANDROID_KEY } from './vault/android-bridge.js';
import { encrypt, decrypt } from './vault/crypto-ops.js';
import { getMeta, setMeta, isSetup, reset } from './vault/meta.js';
import { deriveKeyFromPassphrase, PBKDF2_ITERATIONS } from './vault/passphrase.js';
import { webauthnSupported, registerWebauthn, deriveKeyFromPrf } from './vault/webauthn.js';


export const vault = {
  webauthnSupported,
  androidNativeSupported,
  getMeta,
  isSetup,
  reset,
  encrypt,
  decrypt,

  async registerWebauthn(username){
    const credentialId = await registerWebauthn(username);
    setMeta({ mode: 'webauthn', credentialId });
    return true;
  },

  async setupPassphrase(passphrase){
    const { key, salt } = await deriveKeyFromPassphrase(passphrase);
    setMeta({ mode: 'passphrase', salt, iterations: PBKDF2_ITERATIONS });
    return key;
  },

  // passphraseProvider: () => Promise<string> - только для режима 'passphrase' (ui/vault-modal.js).
  // Выведенный ключ кладём в state.vaultKey - на сессию повторно не спрашиваем.
  async unlock(passphraseProvider){
    if(state.vaultKey) return state.vaultKey;
    const meta = getMeta();
    if(!meta) throw new Error(t('vault.errors.notSetup'));
    let key;
    if(meta.mode === 'android-native'){
      // Мост и биометрия проверяются при первом encrypt/decrypt (BiometricPrompt сам покажет диалог);
      // на unlock() ничего не запрашиваем.
      if(!androidNativeSupported()) throw new Error(t('vault.errors.androidBridgeUnavailable'));
      key = ANDROID_KEY;
    } else if(meta.mode === 'webauthn'){
      key = await deriveKeyFromPrf(meta.credentialId);
    } else if(meta.mode === 'passphrase'){
      if(!passphraseProvider) throw new Error(t('vault.errors.passphraseRequired'));
      const passphrase = await passphraseProvider();
      if(passphrase == null) throw new Error(t('vault.errors.passphraseCancelled'));
      ({ key } = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations));
    } else {
      throw new Error(t('vault.errors.unknownMode', {mode: meta.mode}));
    }
    state.vaultKey = key;
    return key;
  },

  // Настраивает vault. Приоритет жёстко фиксирован:
  //   1) android-native, если доступен (BiometricManager.canAuthenticate == BIOMETRIC_SUCCESS
  //      для BIOMETRIC_STRONG|DEVICE_CREDENTIAL) - всегда, включая принудительный перенос с
  //      'passphrase'/'webauthn': старый режим тихо сбрасывается, без подтверждения и пароль-фразы;
  //   2) WebAuthn+PRF - если android-native недоступен;
  //   3) пароль-фраза (passphraseProvider) - если недоступны оба.
  // Если vault уже в 'android-native' или лучшем доступном режиме - ничего не делаем.
  //
  // Возвращает true при принудительной миграции (meta.mode заменён): persistAccount() в connect.js
  // должен перешифровать данные, т.к. старый ciphertext под новым ключом не расшифруется.
  async ensureSetup(passphraseProvider){
    const meta = getMeta();

    if(androidNativeSupported()){
      if(meta && meta.mode !== 'android-native'){
        debugLog('[vault] AndroidVaultBridge доступен - принудительно переключаем ' + meta.mode + ' -> android-native');
        reset();
      }
      if(!isSetup()){
        setMeta({ mode: 'android-native' });
        state.vaultKey = ANDROID_KEY;
      }
      return;
    }

    if(meta) return;

    if(!passphraseProvider) throw new Error(t('vault.errors.setupPassphraseRequired'));
    const passphrase = await passphraseProvider(true);
    if(passphrase == null) throw new Error(t('vault.errors.setupCancelled'));
    const key = await vault.setupPassphrase(passphrase);
    state.vaultKey = key;
  },
};
