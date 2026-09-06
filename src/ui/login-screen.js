// ===================== ui/login-screen.js =====================
// Экран логина: статус подключения, автоподстановка/забыть сохранённый аккаунт.
import { LS_KEY, LAST_WS_URL_KEY, EXAMPLE_WS_URL, EXAMPLE_JID } from '../core/constants.js';
import { state } from '../core/state.js';
import { lsGet, lsRemove } from '../core/storage.js';
import { $ } from '../core/dom-utils.js';
import { debugLog } from '../core/debug-log.js';
import { getVaultBlob, flushVaultBlob, markVaultBlobDirty } from '../crypto/omemo-vault.js';
import { promptVaultPassphrase } from './vault-modal.js';
import { t } from '../i18n/t.js';

// Проставляет адрес подключения (если он уже когда-то использовался) и
// пример JID в форму логина. Вызывается один раз при старте, до
// initSavedAccount() - если сохранённой учётки нет, initSavedAccount ничего
// не перезапишет, и это значение (или пустая строка на самом первом запуске)
// так и останется.
//
// ws-url НЕ имеет хардкод-дефолта: единственный источник значения -
// LAST_WS_URL_KEY в обычном (не vault) localStorage, куда оно пишется при
// каждом успешном коннекте независимо от "запомнить на устройстве" (см.
// net/connection/connect.js). На самом первом запуске устройства, когда
// подключений ещё не было, поле остаётся пустым - только placeholder
// показывает формат (EXAMPLE_WS_URL), не подсказывая реальный адрес.
export function initLoginDefaults(){
  const wsUrl = lsGet(LAST_WS_URL_KEY, '');
  $('ws-url').value = wsUrl;
  $('ws-url').placeholder = EXAMPLE_WS_URL;
  $('jid').placeholder = EXAMPLE_JID;
}

export function setLoginStatus(text, isErr){
  const s = $('login-status');
  s.textContent = text;
  s.classList.toggle('err', !!isErr);
}

export function setConnectBtnEnabled(v){ $('connect-btn').disabled = !v; }

export function showApp(){
  $('login-screen').style.display = 'none';
  $('app').classList.add('active');
}

// Пока идёт автоматический вход с сохранённым на устройстве аккаунтом,
// прячем саму форму логина (поля, кнопку, блок "сохранён: ...") - чтобы
// она не мелькала на экране, а виден был только бренд/статус подключения.
// Если автовход не удастся (неверный пароль, сервер недоступен и т.п.),
// connection.js вызовет setAutoConnecting(false) - форма снова появится,
// чтобы пользователь мог поправить данные вручную.
export function setAutoConnecting(v){
  $('login-screen').classList.toggle('auto-connecting', !!v);
}

// Расшифровывает сохранённую учётку (см. crypto/vault.js). Для режима
// 'webauthn' спросит биометрию/PIN устройства, для 'passphrase' -
// покажет модалку ввода пароль-фразы. При отмене/ошибке - null,
// форма логина просто останется пустой (учётка не подставится).
export async function loadSavedAccount(){
  try{
    // Расшифровывает ОБЩИЙ блок (учётка + OMEMO data-key'и, см.
    // crypto/omemo-vault.js) - ровно один поход к vault за всю сессию.
    // Дальше и persistAccount(), и OMEMO-инициализация переиспользуют уже
    // расшифрованный state.vaultBlob вместо того, чтобы каждый лезть в vault
    // по отдельности (тот самый баг с двойным запросом биометрии).
    const vaultBlob = await getVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
    const saved = vaultBlob.account;
    // Запоминаем, что на диске уже лежит именно это - чтобы
    // connect.js:persistAccount() не перешифровывал без необходимости.
    state.lastPersistedAccount = saved;
    return saved;
  }catch(e){
    debugLog('[vault] не удалось расшифровать сохранённую учётку: ' + (e && e.message ? e.message : e));
    return null;
  }
}

export async function initSavedAccount(){
  const saved = await loadSavedAccount();
  if(saved && saved.jid){
    $('ws-url').value = saved.wsUrl || $('ws-url').value;
    $('jid').value = saved.jid;
    $('password').value = saved.password || '';
    $('saved-account').style.display = 'flex';
    $('saved-account-label').textContent = t('login.savedAccount', { jid: saved.jid });
  }
  return saved;
}

// "Забыть" на экране логина - убирает только сохранённые wsUrl/jid/пароль.
// OMEMO data-key'и (в том же общем блоке, см. crypto/omemo-vault.js) НЕ
// трогает: это не выход из аккаунта, а просто отказ от автовхода на этом
// устройстве - ключи шифрования переписки должны пережить это, иначе
// следующий логин на этом устройстве завёл бы новый OMEMO-идентификатор и
// собеседникам пришлось бы заново подтверждать доверие.
export async function forgetAccount(){
  try{
    const blob = await getVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
    if(blob.account){
      blob.account = null;
      markVaultBlobDirty();
      await flushVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
    }
  }catch(e){
    debugLog('[vault] не удалось убрать сохранённую учётку: ' + (e && e.message ? e.message : e));
    lsRemove(LS_KEY); // на крайний случай (например, блок совсем не читается) - не оставлять пароль на диске
  }
  state.lastPersistedAccount = null;
  $('saved-account').style.display = 'none';
  // wsUrl не входит в "забыть" (не секрет, хранится отдельно от JID/пароля,
  // см. LAST_WS_URL_KEY) - оставляем то же значение, что уже подставил
  // initLoginDefaults() при старте (пусто, если подключений ещё не было).
  $('ws-url').value = lsGet(LAST_WS_URL_KEY, '');
  $('jid').value = '';
  $('password').value = '';
}
