// ===================== ui/vault-modal.js =====================
// Модалка запроса пароль-фразы для crypto/vault.js - используется, только
// когда ни android-native (AndroidKeyStore), ни WebAuthn PRF недоступны
// (см. vault.ensureSetup/unlock в crypto/vault.js).
import { $ } from '../core/dom-utils.js';
import { trapFocus } from '../core/modal-a11y.js';
import { t } from '../i18n/t.js';

// isSetup=true - первичная настройка (просим придумать фразу),
// false - разблокировка уже настроенного vault. Возвращает
// Promise<string|null> (null - если пользователь отменил).
export function promptVaultPassphrase(isSetup){
  return new Promise(resolve => {
    const modal = $('vault-modal');
    const box = modal.querySelector('.modal-box');
    const input = $('vault-passphrase');
    const err = $('vault-error');
    $('vault-title').textContent = isSetup ? t('vault.setupTitle') : t('vault.unlockTitle');
    $('vault-desc').textContent = isSetup ? t('vault.setupDesc') : t('vault.unlockDesc');
    err.style.display = 'none';
    input.value = '';
    modal.classList.add('active');
    // Начальный фокус теперь ставит trapFocus() ниже (первый фокусируемый
    // элемент внутри .modal-box - это как раз input, т.к. в разметке он
    // идёт раньше кнопок Отмена/Продолжить) - отдельный setTimeout(focus)
    // больше не нужен.

    const cleanup = (result) => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      input.removeEventListener('keydown', onKeydown);
      untrap();
      resolve(result);
    };
    const onOk = () => {
      if(!input.value){ err.textContent = t('vault.emptyError'); err.style.display = 'block'; return; }
      cleanup(input.value);
    };
    const onCancel = () => cleanup(null);
    const onOverlay = (e) => { if(e.target === modal) cleanup(null); };
    const onKeydown = (e) => { if(e.key === 'Enter') onOk(); };
    const okBtn = $('vault-ok');
    const cancelBtn = $('vault-cancel');
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
    input.addEventListener('keydown', onKeydown);
    // Escape приравнивается к отмене - тот же исход, что и клик по фону/Отмена.
    const untrap = trapFocus(box, onCancel);
  });
}

