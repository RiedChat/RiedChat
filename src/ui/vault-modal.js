// ===================== ui/vault-modal.js =====================
// Модалка пароль-фразы для crypto/vault.js: только если недоступны и android-native (AndroidKeyStore), и WebAuthn PRF (vault.ensureSetup/unlock).
import { $, showDialog } from '../core/dom-utils.js';
import { t } from '../i18n/t.js';

// isSetup=true - первичная настройка, false - разблокировка. Возвращает Promise<string|null> (null - отмена).
export async function promptVaultPassphrase(isSetup){
  const dlg = $('vault-modal');
  const input = $('vault-passphrase');
  const err = $('vault-error');
  $('vault-title').textContent = isSetup ? t('vault.setupTitle') : t('vault.unlockTitle');
  $('vault-desc').textContent = isSetup ? t('vault.setupDesc') : t('vault.unlockDesc');
  err.hidden = true;
  input.value = '';

  // Enter в поле = submit формы (единственная submit-кнопка - «Продолжить»); пустую фразу не принимаем, диалог остаётся открытым.
  const onSubmit = e => {
    if(input.value) return;
    e.preventDefault();
    err.textContent = t('vault.emptyError');
    err.hidden = false;
  };
  const onCancel = () => dlg.close('cancel');
  $('vault-form').addEventListener('submit', onSubmit);
  $('vault-cancel').addEventListener('click', onCancel);

  const result = await showDialog(dlg);
  $('vault-form').removeEventListener('submit', onSubmit);
  $('vault-cancel').removeEventListener('click', onCancel);
  const passphrase = result === 'ok' ? input.value : null;
  input.value = '';
  return passphrase;
}
