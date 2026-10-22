// ===================== net/connection/resilience.js =====================
// Устойчивость соединения к засыпанию экрана, сворачиванию и закрытию вкладки. Само подключение - connect.js.
import { debugLog } from '../../core/debug-log.js';
import { isAppActive, toast } from '../../core/dom-utils.js';
import { sendIqSafe } from '../../core/iq.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

import { connect } from './connect.js';

// ---------------- ВОССТАНОВЛЕНИЕ СВЯЗИ ПОСЛЕ ВЫКЛЮЧЕНИЯ ЭКРАНА ----------------
// Мобильная ОС молча "подвешивает" WebSocket: close не срабатывает, Strophe считает соединение
// живым, отправка уходит в пустоту. Лечим: при возврате в приложение шлём XEP-0199 ping с таймаутом;
// нет ответа - тихо переподключаемся с последними данными.
async function pingServer(timeoutMs){
  if(!state.connection?.connected) return false;
  const domain = state.myBareJid ? Strophe.getDomainFromJid(state.myBareJid) : undefined;
  const iq = $iq({type: 'get', to: domain}).c('ping', {xmlns: 'urn:xmpp:ping'});
  // Ошибка, таймаут или синхронный throw send() - sendIqSafe вернёт null: сокет мёртв.
  return !!(await sendIqSafe(iq, timeoutMs));
}

function forceReconnect(){
  const params = state.lastConnectParams;
  if(!params?.jid || !params?.pass){
    toast(t('connection.connectionLost'));
    return;
  }
  debugLog('[resume] соединение не отвечает на ping - переподключаюсь тихо');
  // reset() на мёртвом сокете может бросить - не критично, ниже поднимаем новое соединение.
  try{ state.connection?.reset(); }catch{}
  connect(params.wsUrl, params.jid, params.pass, params.rememberMe);
}

let checking = false; // не запускаем вторую проверку поверх идущей
export async function reconnectIfNeeded(){
  if(checking) return;
  checking = true;
  try{ if(!(await pingServer(6000))) forceReconnect(); }
  finally{ checking = false; }
}

// Подписка на события "пользователь вернулся"; вызывается один раз из app.js.
export function wireResilience(){
  // isAppActive: ещё не залогинены - проверять нечего.
  const resume = () => {
    if(isAppActive() && document.visibilityState === 'visible') reconnectIfNeeded();
  };
  document.addEventListener('visibilitychange', resume);
  // pageshow - подстраховка для iOS (bfcache); online - если ОС сообщает о восстановлении сети.
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);

  // Реактивных проверок выше мало: вкладка, часами открытая в фокусе (ПК), в них не попадает, а idle-таймаут
  // прокси/NAT молча убивает WS - входящие станзы (в т.ч. presence subscribe) теряются.
  // Поэтому дополнительно пингуем периодически.
  setInterval(resume, 60 * 1000);

  // Закрытие вкладки рвёт сокет без предупреждения: mod_smacks держит сессию в resumption,
  // mod_last не фиксирует момент выхода - контакты видят неверное "был в сети".
  // Штатно отключаемся (Strophe.disconnect() шлёт presence unavailable) на pagehide -
  // он надёжнее beforeunload, в т.ч. на мобильных.
  const disconnectCleanly = (event) => {
    // persisted === true - страница уходит в bfcache (переключение приложений/вкладок):
    // НЕ отключаемся, иначе пропадал бы статус online при каждом сворачивании.
    if(event?.persisted) return;
    try{
      if(state.connection?.connected) state.connection.disconnect();
    }catch{
      // Страница уже выгружается - ошибку disconnect() обрабатывать некому.
    }
  };
  window.addEventListener('pagehide', disconnectCleanly);
  // beforeunload - подстраховка для десктопа, где pagehide не всегда успевает.
  window.addEventListener('beforeunload', disconnectCleanly);
}
