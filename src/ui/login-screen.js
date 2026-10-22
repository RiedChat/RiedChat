// ===================== ui/login-screen.js =====================
// Экран логина: статус подключения, автоподстановка/забыть сохранённый аккаунт.
import { LS_KEY, EXAMPLE_JID } from '../core/constants.js';
import { attempt } from '../core/debug-log.js';
import { $ } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { lsRemove } from '../core/storage.js';
import { getVaultBlob, flushVaultBlob, markVaultBlobDirty } from '../crypto/omemo-vault.js';
import { t } from '../i18n/t.js';

import { promptVaultPassphrase } from './vault-modal.js';

const getBlob = () => getVaultBlob(promptVaultPassphrase);
const flushBlob = () => flushVaultBlob(promptVaultPassphrase);

// Проставляет пример JID в форму. Вызывается один раз при старте, до initSavedAccount(). Адрес WebSocket не вводится: он выводится из домена JID (features/login.js:wsUrlFromJid).
export function initLoginDefaults(){
  $('jid').placeholder = EXAMPLE_JID;
}

export function setLoginStatus(text, isErr){
  const s = $('login-status');
  s.textContent = text;
  s.classList.toggle('err', !!isErr);
}

export function setConnectBtnEnabled(v){ $('connect-btn').disabled = !v; }

export function showApp(){
  $('login-screen').hidden = true;
  $('app').classList.add('active');
}

// Во время автовхода с сохранённой учёткой прячем форму логина (поля, кнопку, блок «сохранён: ...»), виден только бренд/статус. Если автовход не удался (неверный пароль, сервер недоступен), connection.js вызовет setAutoConnecting(false) - форма вернётся.
export function setAutoConnecting(v){
  $('login-screen').classList.toggle('auto-connecting', !!v);
}

// Расшифровывает сохранённую учётку (crypto/vault.js): 'webauthn' - биометрия/PIN, 'passphrase' - модалка пароль-фразы. При отмене/ошибке - null, форма остаётся пустой.
async function loadSavedAccount(){
  const saved = await attempt('vault', 'не удалось расшифровать сохранённую учётку', async () => {
    // Расшифровывает общий блок (учётка + OMEMO data-key'и, crypto/omemo-vault.js) - один поход к vault за сессию. persistAccount() и OMEMO-инициализация переиспользуют state.vaultBlob (иначе двойной запрос биометрии).
    const vaultBlob = await getBlob();
    // Запоминаем, что лежит на диске: connect.js:persistAccount() не перешифровывает лишний раз.
    state.lastPersistedAccount = vaultBlob.account;
    return vaultBlob.account;
  });
  return saved ?? null;
}

export async function initSavedAccount(){
  const saved = await loadSavedAccount();
  if(saved?.jid){
    $('jid').value = saved.jid;
    $('password').value = saved.password || '';
    $('saved-account').hidden = false;
    $('saved-account-label').textContent = t('login.savedAccount', { jid: saved.jid });
  }
  return saved;
}

// «Забыть» убирает только jid/пароль (и сохранённый wsUrl в блоке). OMEMO data-key'и (тот же блок, crypto/omemo-vault.js) не трогает: это отказ от автовхода, а не выход из аккаунта. Иначе следующий логин создал бы новый OMEMO-идентификатор, и собеседникам пришлось бы заново подтверждать доверие.
export async function forgetAccount(){
  const done = await attempt('vault', 'не удалось убрать сохранённую учётку', async () => {
    const blob = await getBlob();
    if(blob.account){
      blob.account = null;
      markVaultBlobDirty();
      await flushBlob();
    }
    return true;
  });
  if(!done) lsRemove(LS_KEY); // на крайний случай (блок не читается) - не оставлять пароль на диске
  state.lastPersistedAccount = null;
  $('saved-account').hidden = true;
  $('jid').value = '';
  $('password').value = '';
}
