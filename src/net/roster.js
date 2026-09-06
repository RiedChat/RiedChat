// ===================== net/roster.js =====================
// Загрузка ростера (списка контактов), добавление контактов, XEP-0012 last-activity.
// Выделено из net/connection.js.
import { NS_LAST } from '../core/constants.js';
import { toast } from '../core/dom-utils.js';
import { loadLastScreen, loadLastSeenMap, persistLastScreen, persistLastSeen } from '../core/last-seen-storage.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { debugLog } from '../core/debug-log.js';
import { loadContactNickMap, loadContactAvatarMap } from './vcard-storage.js';
import { renderRoster } from '../ui/roster.js';
import { renderChatHead } from '../ui/chat-head.js';
import { openChat } from '../app.js';
import { markContactTrusted } from './trusted-contacts.js';
import { t } from '../i18n/t.js';

const S = state;

// ---------------- ROSTER ----------------
// См. комментарий в crypto/omemo/device-list-discovery.js про IQ_TIMEOUT_MS: без
// явного таймаута sendIQ может зависнуть навсегда, если сервер не ответит.
export function fetchRoster(){
  const iq = $iq({type:'get', id:'roster1'}).c('query', {xmlns:'jabber:iq:roster'});
  const lastSeenMap = loadLastSeenMap();
  const nickMap = loadContactNickMap();
  const avatarMap = loadContactAvatarMap();
  S.connection.sendIQ(iq, (res) => {
    const items = res.querySelectorAll('item');
    items.forEach(item => {
      const jid = item.getAttribute('jid');
      const name = item.getAttribute('name') || jid.split('@')[0];
      const subscription = item.getAttribute('subscription') || 'none';
      S.roster[jid] = S.roster[jid] || {};
      S.roster[jid].name = name;
      S.roster[jid].presence = S.roster[jid].presence || 'offline';
      S.roster[jid].lastSeen = S.roster[jid].lastSeen || lastSeenMap[jid] || null;
      // Псевдоним/аватар, которые контакт присылал в presence в прошлых
      // сессиях - показываем их сразу, не дожидаясь, пока контакт снова
      // появится в сети (то же самое сделано для lastSeen выше).
      S.roster[jid].nick = S.roster[jid].nick || nickMap[jid] || null;
      S.roster[jid].avatarUrl = S.roster[jid].avatarUrl || (avatarMap[jid] && avatarMap[jid].dataUrl) || null;
      S.messages[jid] = S.messages[jid] || [];
      // ВАЖНО: если подписка не "both" (напр. контакт был добавлен ещё
      // до того, как появилась авто-обработка presence type="subscribe"
      // в onPresence(), - см. её комментарий), сервер НЕ будет
      // маршрутизировать нам available/unavailable этого контакта, и
      // статус "в сети" не покажется никогда, сколько ни жди. Сервер не
      // обязан повторно доставлять старый зависший subscribe-стос, поэтому
      // сами на всякий случай пере-отправляем запрос подписки - если он
      // уже подтверждён с той стороны, это no-op, если нет - подтолкнёт
      // недостающую половину рукопожатия.
      if(subscription !== 'both' && subscription !== 'to'){
        S.connection.send($pres({to: jid, type: 'subscribe'}));
        debugLog('roster: у ' + jid + ' subscription=' + subscription + ' - повторно отправил запрос подписки (иначе онлайн-статус не придёт)');
      }
    });
    renderRoster();
    // заранее подтягиваем device-list контактов, чтобы значок замка был точным сразу
    Object.keys(S.roster).forEach(jid => omemo.getDeviceList(jid).then(() => renderRoster()));
    // Для контактов, которые сейчас офлайн, уточняем время выхода через
    // XEP-0012 (last-activity) - это даёт точную метку, даже если мы сами
    // были офлайн в момент их disconnect (см. queryLastActivity выше).
    // Если контакт появится в сети до ответа - presence-обработчик просто
    // перезапишет lastSeen заново при следующем его выходе, это не проблема.
    Object.keys(S.roster).forEach(jid => {
      if(S.roster[jid].presence !== 'online') queryLastActivity(jid);
    });

    // Восстанавливаем экран, на котором пользователь остался в прошлый раз (см.
    // persistLastScreen): если это был конкретный чат - и контакт всё ещё
    // есть в ростере - сразу открываем его, а не бросаем в список контактов.
    // Если был в списке контактов (или сохранённых данных нет) - ничего не
    // делаем, приложение и так открывается в этом состоянии по умолчанию.
    if(!S.activeChat){
      const lastScreen = loadLastScreen();
      if(lastScreen && lastScreen.screen === 'chat' && lastScreen.jid && S.roster[lastScreen.jid]){
        openChat(lastScreen.jid);
      }
    }
  }, () => toast(t('netRoster.loadFailed')), 15000);
}

// XEP-0012: спрашиваем сервер контакта, сколько секунд назад он отключился.
// Работает даже если МЫ сами были офлайн в момент его disconnect - в
// отличие от presence-based lastSeen в onPresence() (net/presence/incoming.js), который видит
// только переходы online->offline, случившиеся у нас на глазах.
// Требует, чтобы сервер контакта поддерживал mod_last (XEP-0012); если
// нет - сервер ответит ошибкой (feature-not-implemented/service-unavailable),
// и мы просто остаёмся с уже известным (возможно, менее точным) значением.
export function queryLastActivity(jid){
  return new Promise((resolve) => {
    if(!S.connection || !S.connection.connected){ resolve(false); return; }
    const iq = $iq({type: 'get', to: jid}).c('query', {xmlns: NS_LAST});
    S.connection.sendIQ(iq, (res) => {
      const q = res.querySelector('query');
      const seconds = q ? parseInt(q.getAttribute('seconds'), 10) : NaN;
      if(!isNaN(seconds) && seconds >= 0){
        const ts = Date.now() - seconds * 1000;
        S.roster[jid] = S.roster[jid] || {name: jid.split('@')[0], presence: 'offline'};
        // Значение с сервера считаем источником истины для офлайн-контактов:
        // оно основано на реальном моменте disconnect, а не на том, что мы
        // успели "поймать вживую" через presence.
        S.roster[jid].lastSeen = ts;
        persistLastSeen(jid, ts);
        renderRoster();
        if(S.activeChat === jid) renderChatHead();
      }
      resolve(true);
    }, () => {
      debugLog('last-activity: запрос к ' + jid + ' не удался (сервер не поддерживает XEP-0012, либо контакт/сервер недоступны)');
      resolve(false);
    }, 10000);
  });
}

export function addContact(jid){
  const iq = $iq({type:'set'}).c('query', {xmlns:'jabber:iq:roster'})
    .c('item', {jid});
  S.connection.sendIQ(iq, () => {
    S.connection.send($pres({to: jid, type: 'subscribe'}));
    S.roster[jid] = {name: jid.split('@')[0], presence:'offline'};
    S.messages[jid] = [];
    // Ручное добавление контакта - явное действие пользователя, этого
    // достаточно, чтобы считать контакт доверенным для автозагрузки картинок
    // (riedchat-security-plan.md, п.5), не дожидаясь порога по числу сообщений.
    markContactTrusted(jid);
    renderRoster();
    toast(t('netRoster.requestSent'));
    omemo.getDeviceList(jid, true).then(() => renderRoster());
  }, () => toast(t('netRoster.addFailed')), 15000);
}

// fetchRoster/queryLastActivity потребляются только через прямой import
// (net/connection/bootstrap.js). addContact - через прямой import из
// features/contacts.js. window.App-мост здесь больше не нужен.
