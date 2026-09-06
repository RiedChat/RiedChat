// ===================== net/connection/connect.js =====================
// Подключение по WebSocket (Strophe.js) и стейт-машина статусов логина.
// Пост-логин инициализация - в net/connection/bootstrap.js, устойчивость
// к разрыву связи - в net/connection/resilience.js.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { onLoggedIn } from './bootstrap.js';
import { getVaultBlob, ensureOmemoRawKey, flushVaultBlob, markVaultBlobDirty } from '../../crypto/omemo-vault.js';
import { promptVaultPassphrase } from '../../ui/vault-modal.js';
import { setLoginStatus, setConnectBtnEnabled, setAutoConnecting } from '../../ui/login-screen.js';
import { t } from '../../i18n/t.js';
import { lsSet } from '../../core/storage.js';
import { LAST_WS_URL_KEY } from '../../core/constants.js';

const S = state;

export function connect(wsUrl, jid, pass, rememberMe){
  // Запоминаем параметры последнего подключения (в памяти, не в localStorage -
  // это отдельно от "запомнить на устройстве"), чтобы суметь тихо
  // переподключиться сами, если сессия оборвётся без явного logout
  // (см. reconnectIfNeeded/forceReconnect в net/connection/resilience.js -
  // чинит баг с разрывом соединения при блокировке/выключении экрана телефона).
  S.lastConnectParams = {wsUrl, jid, pass, rememberMe};
  const wasAlreadyActive = $('app').classList.contains('active');
  setLoginStatus(t('connection.connectingStatus'));
  S.connection = new Strophe.Connection(wsUrl);
  S.connection.connect(jid, pass, async (status) => {
    if(status === Strophe.Status.CONNECTING){
      setLoginStatus(t('connection.establishing'));
    } else if(status === Strophe.Status.CONNFAIL){
      setLoginStatus(t('connection.connectFailed'), true);
      setConnectBtnEnabled(true);
      setAutoConnecting(false); // показать форму - автовход не удался, нужны действия пользователя
      if(wasAlreadyActive) toast(t('connection.restoreFailedNetwork'));
    } else if(status === Strophe.Status.AUTHFAIL){
      setLoginStatus(t('connection.wrongCredentials'), true);
      setConnectBtnEnabled(true);
      setAutoConnecting(false); // показать форму - автовход не удался, нужны действия пользователя
      if(wasAlreadyActive) toast(t('connection.restoreFailedWrongPassword'));
    } else if(status === Strophe.Status.DISCONNECTED){
      if($('app').classList.contains('active')) toast(t('connection.disconnected'));
      setConnectBtnEnabled(true);
      setAutoConnecting(false);
    } else if(status === Strophe.Status.CONNECTED){
      S.myJid = S.connection.jid;
      S.myBareJid = Strophe.getBareJidFromJid(S.myJid);
      S.myResource = Strophe.getResourceFromJid(S.myJid);
      setLoginStatus(t('chatHead.online'), false);
      // Не секрет, не привязан к чекбоксу "запомнить на устройстве" - просто
      // чтобы при следующем визите (даже без сохранённого JID/пароля) форма
      // логина открывалась не с пустым полем "из коробки", а с тем адресом,
      // которым пользователь реально пользуется. См. core/constants.js.
      lsSet(LAST_WS_URL_KEY, wsUrl);
      // БАГ (исправлено): раньше учётка (persistAccount) и OMEMO data-key
      // (внутри onLoggedIn()->_initOmemo()) шифровались/расшифровывались
      // ДВУМЯ независимыми вызовами vault.encrypt/decrypt - в режиме
      // 'android-native' это два отдельных BiometricPrompt подряд на один
      // логин (эффект "два раза подряд просит отпечаток"), а если второй не
      // проходил - OMEMO тихо не инициализировался (catch в bootstrap.js
      // проглатывал ошибку в toast), хотя логин по первому промпту уже
      // успевал отработать. Теперь оба секрета живут в ОДНОМ зашифрованном
      // блоке (crypto/omemo-vault.js) - сначала вносим правки по OMEMO-ключу
      // и по учётке ТОЛЬКО в памяти (ensureOmemoRawKey/persistAccount ниже
      // не пишут на диск сами), и лишь потом одним flushVaultBlob() пишем
      // всё разом. Один логин с изменениями на диске = один BiometricPrompt.
      await ensureOmemoRawKey(S.myBareJid, (isSetup) => promptVaultPassphrase(isSetup));
      if(rememberMe){
        await persistAccount({wsUrl, jid, password: pass});
      } else {
        await forgetPersistedAccount();
      }
      await flushVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
      onLoggedIn();
    }
  });
}

// Записывает {wsUrl, jid, password} в общий vault-блок (см. crypto/omemo-vault.js)
// ТОЛЬКО В ПАМЯТИ - фактическая запись на диск (и связанный с ней
// BiometricPrompt/PIN/пароль-фраза) происходит один раз в connect() через
// flushVaultBlob(), уже вместе с правками по OMEMO-ключу.
//
// БАГ (исправлено): раньше эта функция вызывалась безусловно при КАЖДОМ
// успешном connect() с rememberMe - в том числе при автовходе (сразу после
// того, как login-screen.js:loadSavedAccount() только что расшифровал те же
// самые данные) и при тихом forceReconnect() из resilience.js (после
// разблокировки экрана/возврата в приложение). Из-за этого зашифровывались
// (и требовали биометрию/PIN) заново одни и те же неизменившиеся данные.
// Теперь, если {wsUrl,jid,password} совпадает с тем, что уже лежит в
// state.lastPersistedAccount, просто ничего не делаем (и блок не помечается
// изменённым - flushVaultBlob() дальше по цепочке ничего не запишет).
export async function persistAccount(data){
  const unchanged = S.lastPersistedAccount
      && S.lastPersistedAccount.wsUrl === data.wsUrl
      && S.lastPersistedAccount.jid === data.jid
      && S.lastPersistedAccount.password === data.password;
  if(unchanged) return;
  try{
    const blob = await getVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
    blob.account = data;
    markVaultBlobDirty();
    S.lastPersistedAccount = data;
  }catch(e){
    debugLog('[vault] не удалось сохранить аккаунт зашифрованным: ' + (e && e.message ? e.message : e));
    toast && toast(t('connection.saveAccountFailed', {detail: e && e.message ? e.message : e}));
    S.lastPersistedAccount = null;
  }
}

// Убирает сохранённую учётку из общего vault-блока (если rememberMe снят) -
// OMEMO data-key'и в том же блоке не трогает, они не зависят от "запомнить
// на устройстве" (см. коммент в crypto/store.js:createSignalStore).
async function forgetPersistedAccount(){
  if(!S.lastPersistedAccount){
    // Нечего забывать (и, скорее всего, LS_KEY вовсе не создан ещё этим
    // устройством) - не трогаем vault-блок, чтобы не плодить пустых записей.
    return;
  }
  try{
    const blob = await getVaultBlob((isSetup) => promptVaultPassphrase(isSetup));
    blob.account = null;
    markVaultBlobDirty();
  }catch(e){
    // Не трогаем LS_KEY целиком в catch - там могут лежать чужому этому
    // логину не мешающие OMEMO data-key'и других аккаунтов; сама учётка тут
    // и не могла быть только что записана (blob.account ещё не обновлён).
    debugLog('[vault] не удалось убрать сохранённую учётку: ' + (e && e.message ? e.message : e));
  }
  S.lastPersistedAccount = null;
}
