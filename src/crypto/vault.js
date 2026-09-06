// ===================== crypto/vault.js =====================
// Шифрование данных в localStorage (сейчас - сохранённый JID/пароль, см.
// net/connection/connect.js persistAccount и ui/login-screen.js).
// Сам ключ AES-GCM-256 нигде не сериализуется и не хранится: он выводится
// заново при каждой разблокировке, в порядке приоритета -
//   1) android-native: если страница открыта в нашей Android-обёртке
//      (window.AndroidVaultBridge, см. VaultKeystoreBridge.java) - ключ живёт
//      в AndroidKeyStore и никогда не попадает в JS вообще, наружу идут
//      только plaintext/ciphertext конкретной операции; каждая операция
//      гейтована биометрией/PIN через BiometricPrompt.CryptoObject.
//      Выбран основным на Android потому что детерминированно доступен
//      (в отличие от WebAuthn PRF внутри WebView - его прохождение через
//      мост Chromium→Credential Manager не задокументировано и не
//      гарантировано на момент написания);
//   2) webauthn: из WebAuthn PRF-расширения (github.com/w3c/webauthn/wiki/Explainer:-PRF-extension) -
//      требует подтверждения биометрией/PIN аутентификатора на каждый вызов.
//      Основной путь в обычном браузере (не в Android-обёртке), доп. защита
//      там, где android-native недоступен;
//   3) passphrase: если ничего из вышеперечисленного не поддерживается -
//      из пароль-фразы через PBKDF2-SHA256 (310k итераций, см. OWASP-рекомендации 2023+).
// Реализация режимов вынесена в подмодули vault/*.js, этот файл - только
// сборка их в единый объект `vault` и логика выбора/переключения режима
// (ensureSetup/unlock), которая должна видеть все режимы разом.
import { state } from '../core/state.js';
import { debugLog } from '../core/debug-log.js';
import { androidNativeSupported } from './vault/android-bridge.js';
import { webauthnSupported, registerWebauthn, deriveKeyFromPrf } from './vault/webauthn.js';
import { deriveKeyFromPassphrase, PBKDF2_ITERATIONS } from './vault/passphrase.js';
import { getMeta, setMeta, isSetup, reset } from './vault/meta.js';
import { encrypt, decrypt } from './vault/crypto-ops.js';
import { t } from '../i18n/t.js';

export const vault = {};

vault.webauthnSupported = webauthnSupported;
vault.androidNativeSupported = androidNativeSupported;
vault.getMeta = getMeta;
vault.isSetup = isSetup;
vault.reset = reset;
vault.encrypt = encrypt;
vault.decrypt = decrypt;

vault.registerWebauthn = async function(username){
  const credentialId = await registerWebauthn(username);
  setMeta({ mode: 'webauthn', credentialId });
  return true;
};

vault.setupPassphrase = async function(passphrase){
  const { key, salt } = await deriveKeyFromPassphrase(passphrase);
  setMeta({ mode: 'passphrase', salt, iterations: PBKDF2_ITERATIONS });
  return key;
};

// passphraseProvider: () => Promise<string> - вызывается только для режима
// 'passphrase' (модалка ui/vault-modal.js). Успешно выведенный ключ кладём
// в state.vaultKey - на время сессии повторно не спрашиваем.
vault.unlock = async function(passphraseProvider){
  if(state.vaultKey) return state.vaultKey;
  const meta = getMeta();
  if(!meta) throw new Error(t('vault.errors.notSetup'));
  let key;
  if(meta.mode === 'android-native'){
    // Не настоящий CryptoKey - сам ключ живёт в AndroidKeyStore и в JS не
    // попадает. Это лишь маркер режима для vault.encrypt/decrypt.
    // Наличие моста и биометрии проверяется по факту при первом encrypt/decrypt
    // (BiometricPrompt сам покажет диалог) - на unlock() ничего не запрашиваем,
    // чтобы не дёргать биометрию лишний раз при каждом вызове unlock().
    if(!androidNativeSupported()) throw new Error(t('vault.errors.androidBridgeUnavailable'));
    key = { __androidNative: true };
  } else if(meta.mode === 'webauthn'){
    key = await deriveKeyFromPrf(meta.credentialId);
  } else if(meta.mode === 'passphrase'){
    if(!passphraseProvider) throw new Error(t('vault.errors.passphraseRequired'));
    const passphrase = (await passphraseProvider()) ?? null;
    if(passphrase === null) throw new Error(t('vault.errors.passphraseCancelled'));
    ({ key } = await deriveKeyFromPassphrase(passphrase, meta.salt, meta.iterations));
  } else {
    throw new Error(t('vault.errors.unknownMode', {mode: meta.mode}));
  }
  state.vaultKey = key;
  return key;
};

// Настраивает vault. Приоритет ЖЁСТКО зафиксирован (без выбора пользователя):
//   1) android-native - если доступен (BiometricManager.canAuthenticate ==
//      BIOMETRIC_SUCCESS для BIOMETRIC_STRONG|DEVICE_CREDENTIAL), используем
//      его ВСЕГДА, принудительно, включая перенос уже настроенного vault:
//      если meta.mode сейчас 'passphrase'/'webauthn' (например, аккаунт был
//      сохранён ещё до появления AndroidVaultBridge в приложении, или на
//      устройстве, где isAvailable() на тот момент вернул false) - тихо
//      сбрасываем старый режим и переключаемся на android-native, без
//      подтверждения пользователем и без пароль-фразы;
//   2) WebAuthn+PRF - только если android-native недоступен;
//   3) пароль-фраза (passphraseProvider) - только если недоступны оба выше.
// Если vault уже настроен в 'android-native' или в лучшем из доступных на
// устройстве режимов - ничего не делаем.
//
// Возвращает true, если только что выполнила принудительную миграцию со
// старого режима (meta.mode сброшен и заменён) - persistAccount() в
// connect.js должен в этом случае перешифровать данные заново, даже если
// сами данные (jid/пароль) не изменились: старый ciphertext был зашифрован
// под старый ключ и с новым режимом больше не расшифруется.
vault.ensureSetup = async function(username, passphraseProvider){
  const meta = getMeta();

  if(androidNativeSupported()){
    let migrated = false;
    if(meta && meta.mode !== 'android-native'){
      debugLog('[vault] AndroidVaultBridge доступен - принудительно переключаем ' + meta.mode + ' -> android-native');
      reset();
      migrated = true;
    }
    if(!isSetup()){
      setMeta({ mode: 'android-native' });
      state.vaultKey = { __androidNative: true };
    }
    return migrated;
  }

  if(meta) return false; // уже настроен в лучшем доступном на устройстве режиме - не трогаем

  if(!passphraseProvider) throw new Error(t('vault.errors.setupPassphraseRequired'));
  const passphrase = (await passphraseProvider(true)) ?? null;
  if(passphrase === null) throw new Error(t('vault.errors.setupCancelled'));
  const key = await vault.setupPassphrase(passphrase);
  state.vaultKey = key;
  return false;
};
