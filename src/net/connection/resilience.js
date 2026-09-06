// ===================== net/connection/resilience.js =====================
// Устойчивость соединения к засыпанию экрана/сворачиванию приложения и к
// закрытию вкладки. Установление самого соединения - в
// net/connection/connect.js.
import { $, toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { connect } from './connect.js';
import { t } from '../../i18n/t.js';

const S = state;

// ---------------- ВОССТАНОВЛЕНИЕ СВЯЗИ ПОСЛЕ ВЫКЛЮЧЕНИЯ ЭКРАНА ----------------
// БАГ: когда экран телефона гаснет (или приложение уходит в фон), мобильная ОС
// часто "подвешивает" WebSocket молча - TCP-сокет по факту мёртв, но событие
// close у него может не сработать ещё очень долго (иногда вообще не срабатывает
// до следующей попытки записи). Strophe при этом продолжает считать соединение
// живым (S.connection.connected === true), поэтому отправка сообщений просто
// тихо "проваливается в пустоту" - ни ошибки, ни доставки. Раньше приложение
// никак это не обнаруживало и не переподключалось само.
//
// ИСПРАВЛЕНИЕ: при каждом возврате пользователя в приложение (вкладка/экран
// снова видимы) шлём короткий XEP-0199 ping с таймаутом. Если ответа нет -
// считаем сокет мёртвым и тихо переподключаемся заново с последними
// введёнными данными, без участия пользователя.
export function pingServer(timeoutMs){
  return new Promise((resolve) => {
    if(!S.connection || !S.connection.connected){ resolve(false); return; }
    try{
      const domain = S.myBareJid ? Strophe.getDomainFromJid(S.myBareJid) : undefined;
      const iq = $iq({type: 'get', to: domain}).c('ping', {xmlns: 'urn:xmpp:ping'});
      let settled = false;
      S.connection.sendIQ(
        iq,
        () => { if(!settled){ settled = true; resolve(true); } },
        () => { if(!settled){ settled = true; resolve(false); } }, // ошибка ИЛИ таймаут - сокет считаем мёртвым
        timeoutMs
      );
    }catch(e){
      resolve(false); // send() бросил синхронно - сокет точно мёртв
    }
  });
}

export function forceReconnect(){
  const params = S.lastConnectParams;
  if(!params || !params.jid || !params.pass){
    toast(t('connection.connectionLost'));
    return;
  }
  debugLog('[resume] соединение не отвечает на ping - переподключаюсь тихо');
  // reset() на уже мёртвом/полуразрушенном сокете иногда бросает - это не
  // критично, ниже всё равно тут же поднимаем новое соединение через connect().
  try{ if(S.connection) S.connection.reset(); }catch(e){}
  connect(params.wsUrl, params.jid, params.pass, params.rememberMe);
}

export async function reconnectIfNeeded(){
  if(S._resumeCheckInProgress) return; // не запускаем вторую проверку поверх уже идущей
  S._resumeCheckInProgress = true;
  try{
    const alive = await pingServer(6000);
    if(!alive) forceReconnect();
  }finally{
    S._resumeCheckInProgress = false;
  }
}

// Подписка на события "пользователь вернулся" - вызывается один раз при старте (app.js).
export function wireResilience(){
  const tryResume = () => {
    if(!$('app').classList.contains('active')) return; // ещё не залогинены - нечего проверять
    reconnectIfNeeded();
  };
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') tryResume();
  });
  // pageshow - доп. подстраховка для iOS (bfcache-восстановление вкладки);
  // online - доп. подстраховка, если ОС сама сообщает о восстановлении сети.
  window.addEventListener('pageshow', tryResume);
  window.addEventListener('online', tryResume);

  // БАГ: все проверки выше - РЕАКТИВНЫЕ, привязанные к событиям сворачивания/
  // разворачивания вкладки или смены сетевого статуса. Вкладка, которая просто
  // открыта и находится в фокусе часами (типичный случай для ПК - никто её не
  // сворачивал и не переключал), никогда не попадёт ни в один из этих
  // обработчиков. Если за это время WebSocket тихо умер (idle-таймаут на
  // прокси/NAT/балансировщике - частое явление для долгоживущих WS-соединений
  // без прикладного keepalive, особенно за корпоративными сетями), Strophe
  // всё равно продолжает считать S.connection.connected === true, и входящие
  // стансы (в т.ч. presence type='subscribe' от только что добавившего в
  // друзья контакта) улетают в пустоту без единой ошибки - эффект "ничего не
  // приходит, хотя всё вроде подключено". ИСПРАВЛЕНИЕ: держим соединение под
  // периодическим XEP-0199 пингом независимо от того, сворачивали вкладку
  // или нет - так же, как это уже сделано для реакции на события выше.
  const KEEPALIVE_INTERVAL_MS = 60 * 1000;
  setInterval(() => {
    if(document.visibilityState === 'visible') tryResume();
  }, KEEPALIVE_INTERVAL_MS);

  // БАГ: при простом закрытии вкладки (а не через кнопку "выйти") клиент
  // никак не предупреждал сервер - браузер резко рвал TCP-сокет. Из-за
  // mod_smacks (XEP-0198, см. prosody_cfg.lua) сервер держит такую сессию
  // "на всякий случай" ещё некоторое время в состоянии resumption, и
  // mod_last (XEP-0012) не фиксирует точный момент выхода, пока эта пауза
  // не истечёт - контакты, которые в этот момент были офлайн, потом видят
  // неверное/устаревшее время. ИСПРАВЛЕНИЕ: явно отключаемся штатно
  // (Strophe.disconnect() шлёт presence unavailable и закрывает XMPP-поток
  // корректной стансой) при первой же возможности - pagehide срабатывает
  // куда надёжнее, чем beforeunload, в т.ч. на мобильных браузерах при
  // закрытии вкладки/сворачивании со свайпом.
  const disconnectCleanly = (event) => {
    // event.persisted === true значит браузер не закрывает страницу
    // насовсем, а замораживает её в bfcache (обычное переключение между
    // приложениями/вкладками на мобильных) - в этом случае специально
    // НЕ отключаемся, иначе статус "online" пропадал бы при каждом
    // мимолётном сворачивании, что противоречит логике wireResilience
    // выше (она как раз держит соединение живым через простое
    // сворачивание/блокировку экрана).
    if(event && event.persisted) return;
    try{
      if(S.connection && S.connection.connected){
        S.connection.disconnect();
      }
    }catch(e){
      // Страница и так уже закрывается/выгружается - упавший disconnect()
      // (например, сокет уже разорван браузером) обрабатывать некому и незачем.
    }
  };
  window.addEventListener('pagehide', disconnectCleanly);
  // beforeunload - доп. подстраховка для десктопных браузеров, где
  // pagehide иногда не успевает отработать при обычном закрытии окна.
  window.addEventListener('beforeunload', disconnectCleanly);
}
