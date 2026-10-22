// ===================== net/connection/connect.js =====================
// WebSocket-подключение (Strophe) и статусы логина. Пост-логин - bootstrap.js, устойчивость - resilience.js.
import { LAST_WS_URL_KEY } from '../../core/constants.js';
import { debugLog, errMsg } from '../../core/debug-log.js';
import { isAppActive, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { lsSet } from '../../core/storage.js';
import { getVaultBlob, ensureOmemoRawKey, flushVaultBlob, markVaultBlobDirty } from '../../crypto/omemo-vault.js';
import { t } from '../../i18n/t.js';
import { setLoginStatus, setConnectBtnEnabled, setAutoConnecting } from '../../ui/login-screen.js';
import { promptVaultPassphrase } from '../../ui/vault-modal.js';

import { onLoggedIn } from './bootstrap.js';


export function connect(wsUrl, jid, pass, rememberMe){
// Параметры последнего подключения (только в памяти) - для тихого переподключения
// (см. reconnectIfNeeded/forceReconnect в resilience.js).
  state.lastConnectParams = {wsUrl, jid, pass, rememberMe};
  const wasAlreadyActive = isAppActive();
// Показать форму логина: автовход не удался или соединение закрыто.
  const resetLoginForm = () => {
    setConnectBtnEnabled(true);
    setAutoConnecting(false);
  };
  const failLogin = (statusText, restoreToastText) => {
    setLoginStatus(statusText, true);
    resetLoginForm();
    if(wasAlreadyActive) toast(restoreToastText);
  };
  setLoginStatus(t('connection.connectingStatus'));
  state.connection = new Strophe.Connection(wsUrl);
  state.connection.connect(jid, pass, async (status) => {
    if(status === Strophe.Status.CONNECTING){
      setLoginStatus(t('connection.establishing'));
    } else if(status === Strophe.Status.CONNFAIL){
      failLogin(t('connection.connectFailed'), t('connection.restoreFailedNetwork'));
    } else if(status === Strophe.Status.AUTHFAIL){
      failLogin(t('connection.wrongCredentials'), t('connection.restoreFailedWrongPassword'));
    } else if(status === Strophe.Status.DISCONNECTED){
      if(isAppActive()) toast(t('connection.disconnected'));
      resetLoginForm();
    } else if(status === Strophe.Status.CONNECTED){
      state.myJid = state.connection.jid;
      state.myBareJid = Strophe.getBareJidFromJid(state.myJid);
      state.myResource = Strophe.getResourceFromJid(state.myJid);
      setLoginStatus(t('chatHead.online'), false);
// Не секрет, не зависит от "запомнить": подставляется в форму логина при следующем визите (core/constants.js).
      lsSet(LAST_WS_URL_KEY, wsUrl);
// Учётка (persistAccount) и OMEMO data-key делят ОДИН зашифрованный блок (crypto/omemo-vault.js):
// сначала правим оба только в памяти (ensureOmemoRawKey/persistAccount на диск не пишут),
// затем один flushVaultBlob(). Иначе в 'android-native' - два BiometricPrompt за логин.
      await ensureOmemoRawKey(state.myBareJid, promptVaultPassphrase);
      if(rememberMe){
        await persistAccount({wsUrl, jid, password: pass});
      } else {
        await forgetPersistedAccount();
      }
      try{
        await flushVaultBlob(promptVaultPassphrase);
      }catch(e){
// localStorage переполнен/недоступен: логин продолжаем, историю на диск не пишем
// (getHistoryStorageKey бросит при повторном flush).
        debugLog('[vault] не удалось записать vault-блок: ' + errMsg(e));
        toast(t('connection.saveAccountFailed', {detail: errMsg(e)}));
      }
      onLoggedIn();
    }
  });
}

// Пишет {wsUrl, jid, password} в vault-блок ТОЛЬКО В ПАМЯТИ; на диск - один раз в connect() через flushVaultBlob().
// Если данные совпадают со state.lastPersistedAccount (автовход, тихий forceReconnect) - no-op,
// чтобы не запрашивать биометрию/PIN повторно.
async function persistAccount(data){
  const unchanged = state.lastPersistedAccount
      && state.lastPersistedAccount.wsUrl === data.wsUrl
      && state.lastPersistedAccount.jid === data.jid
      && state.lastPersistedAccount.password === data.password;
  if(unchanged) return;
  try{
    const blob = await getVaultBlob(promptVaultPassphrase);
    blob.account = data;
    markVaultBlobDirty();
    state.lastPersistedAccount = data;
  }catch(e){
    debugLog('[vault] не удалось сохранить аккаунт зашифрованным: ' + errMsg(e));
    toast(t('connection.saveAccountFailed', {detail: errMsg(e)}));
    state.lastPersistedAccount = null;
  }
}

// Убирает учётку из vault-блока (rememberMe снят); OMEMO data-key'и не трогает (см. crypto/store.js:createSignalStore).
async function forgetPersistedAccount(){
  if(!state.lastPersistedAccount){
// Нечего забывать - vault-блок не трогаем.
    return;
  }
  try{
    const blob = await getVaultBlob(promptVaultPassphrase);
    blob.account = null;
    markVaultBlobDirty();
  }catch(e){
// LS_KEY в catch не трогаем: там OMEMO data-key'и других аккаунтов.
    debugLog('[vault] не удалось убрать сохранённую учётку: ' + errMsg(e));
  }
  state.lastPersistedAccount = null;
}
