// ===================== features/login.js =====================
// Обработчики событий экрана логина: кнопка "Войти", Enter, забыть аккаунт,
// автоматическое подключение при наличии сохранённых учётных данных.
import { $ } from '../core/dom-utils.js';
import { setLoginStatus, initLoginDefaults, initSavedAccount, setAutoConnecting, forgetAccount } from '../ui/login-screen.js';
import { connect } from '../net/connection/connect.js';
import { t } from '../i18n/t.js';

// Разрешаем незашифрованный ws:// только для локальной разработки
// (localhost/127.0.0.1/[::1]) - в любом другом случае это отправка пароля
// и всего трафика открытым текстом (riedchat-security-plan.md, п.8).
function isAllowedWsUrl(wsUrl){
    if(/^wss:\/\//i.test(wsUrl)) return true;
    if(!/^ws:\/\//i.test(wsUrl)) return false; // не ws:// и не wss:// - не наш протокол вовсе
    let host;
    try{ host = new URL(wsUrl).hostname; } catch(e){ return false; }
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

function doConnect(){
    const wsUrl = $('ws-url').value.trim();
    const jid = $('jid').value.trim();
    const pass = $('password').value;
    if(!wsUrl || !jid || !pass){ setLoginStatus(t('login.fillAllFields'), true); return; }
    if(!isAllowedWsUrl(wsUrl)){
      setLoginStatus(t('login.wsUrlMustBeWss'), true);
      setAutoConnecting(false); // если это был автовход с сохранённым (сломанным) wsUrl - вернуть форму логина
      return;
    }
    $('connect-btn').disabled = true;
    connect(wsUrl, jid, pass, $('remember-me').checked);
}

export async function wireLogin(){
    initLoginDefaults();
    $('forget-account').addEventListener('click', () => forgetAccount());
    $('connect-btn').addEventListener('click', doConnect);
    [$('ws-url'), $('jid'), $('password')].forEach(el =>
      el.addEventListener('keydown', e => { if(e.key === 'Enter') doConnect(); })
    );

    // Если в localStorage уже есть сохранённый аккаунт (JID + пароль) -
    // расшифровываем (crypto/vault.js, может спросить биометрию/пароль-фразу)
    // и заходим сразу автоматически, без нажатия кнопки "Войти".
    const saved = await initSavedAccount();
    if(saved && saved.jid && saved.password){
      setAutoConnecting(true);
      doConnect();
    }
}
