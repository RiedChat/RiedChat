// ===================== features/login.js =====================
// Экран логина: "Войти", Enter, забыть аккаунт, автовход по сохранённым данным.
import { $ } from '../core/dom-utils.js';
import { t } from '../i18n/t.js';
import { connect } from '../net/connection/connect.js';
import { setLoginStatus, initLoginDefaults, initSavedAccount, setAutoConnecting, forgetAccount } from '../ui/login-screen.js';

// ws:// без шифрования разрешён только для localhost/127.0.0.1/[::1]: иначе пароль и трафик идут открытым текстом (riedchat-security-plan.md, п.8).
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function isAllowedWsUrl(wsUrl){
  try{
    const { protocol, hostname } = new URL(wsUrl);
    return protocol === 'wss:' || (protocol === 'ws:' && LOCAL_HOSTS.includes(hostname));
  }catch{ return false; }
}

// Домен берётся из JID (user@domain[/resource]), порт и путь фиксированы: wss://domain:5281/xmpp-websocket.
function wsUrlFromJid(jid){
  const domain = jid.split('/')[0].split('@')[1];
  return domain ? 'wss://' + domain + ':5281/xmpp-websocket' : '';
}

function doConnect(){
    const jid = $('jid').value.trim();
    const pass = $('password').value;
    if(!jid || !pass){ setLoginStatus(t('login.fillAllFields'), true); return; }
    const wsUrl = wsUrlFromJid(jid);
    if(!wsUrl || !isAllowedWsUrl(wsUrl)){
      setLoginStatus(t('login.invalidJid'), true);
      setAutoConnecting(false); // автовход с битым JID - вернуть форму логина
      return;
    }
    $('connect-btn').disabled = true;
    connect(wsUrl, jid, pass, $('remember-me').checked);
}

export async function wireLogin(){
    initLoginDefaults();
    $('forget-account').addEventListener('click', () => forgetAccount());
    $('connect-btn').addEventListener('click', doConnect);
    [$('jid'), $('password')].forEach(el =>
      el.addEventListener('keydown', e => { if(e.key === 'Enter') doConnect(); })
    );

    // Есть сохранённый аккаунт (JID + пароль) - расшифровываем (crypto/vault.js, может спросить биометрию/парольную фразу) и входим без кнопки "Войти".
    const saved = await initSavedAccount();
    if(saved?.jid && saved.password){
      setAutoConnecting(true);
      doConnect();
    }
}
