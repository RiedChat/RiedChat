// ===================== net/roster.js =====================
// Загрузка ростера, добавление контактов, XEP-0012 last-activity. Из net/connection.js.
import { openChat } from '../app.js';
import { NS_LAST } from '../core/constants.js';
import { debugLog } from '../core/debug-log.js';
import { toast, nickOf } from '../core/dom-utils.js';
import { sendIqSafe } from '../core/iq.js';
import { lastScreenStore, lastSeenStore } from '../core/last-seen-storage.js';
import { state, ensureChat } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { t } from '../i18n/t.js';
import { renderChatHead } from '../ui/chat-head.js';
import { renderRoster } from '../ui/roster.js';

import { markContactTrusted } from './trusted-contacts.js';
import { contactNickStore, contactAvatarStore } from './vcard-storage.js';



// ---------------- ROSTER ----------------
const loadDevices = (jid, force) => omemo.getDeviceList(jid, force).then(() => renderRoster());

// core/iq.js: sendIqAsync всегда передаёт таймаут, иначе sendIQ может зависнуть при молчании сервера.
export async function fetchRoster(){
  const iq = $iq({type:'get', id:'roster1'}).c('query', {xmlns:'jabber:iq:roster'});
  const lastSeenMap = lastSeenStore.all();
  const nickMap = contactNickStore.all();
  const avatarMap = contactAvatarStore.all();
  const res = await sendIqSafe(iq);
  if(!res){
    toast(t('netRoster.loadFailed'));
    return;
  }
  res.querySelectorAll('item').forEach(item => {
    const jid = item.getAttribute('jid');
    const subscription = item.getAttribute('subscription') || 'none';
    ensureChat(jid);
    const c = state.roster[jid];
    c.name = item.getAttribute('name') || nickOf(jid);
    c.presence ||= 'offline';
    c.lastSeen ||= lastSeenMap[jid] || null;
    // Ник/аватар из presence прошлых сессий показываем сразу, не дожидаясь появления контакта в сети (как lastSeen выше).
    c.nick ||= nickMap[jid] || null;
    c.avatarUrl ||= avatarMap[jid]?.dataUrl || null;
    // Если подписка не "both" (контакт добавлен до авто-обработки presence subscribe в onPresence()),
    // сервер не пришлёт его available/unavailable - "в сети" не покажется никогда. Старый зависший
    // subscribe сервер повторно не доставляет, поэтому переотправляем запрос подписки:
    // если подтверждён - no-op, иначе довершит рукопожатие.
    if(subscription !== 'both' && subscription !== 'to'){
      state.connection.send($pres({to: jid, type: 'subscribe'}));
      debugLog('roster: у ' + jid + ' subscription=' + subscription + ' - повторно отправил запрос подписки (иначе онлайн-статус не придёт)');
    }
  });
  renderRoster();
  Object.keys(state.roster).forEach(jid => {
    // заранее подтягиваем device-list контактов, чтобы значок замка был точным сразу
    loadDevices(jid);
    // Для офлайн-контактов уточняем время выхода через XEP-0012 (queryLastActivity) - метка точна,
    // даже если мы были офлайн в момент их disconnect. Если контакт появится в сети до ответа,
    // presence-обработчик перезапишет lastSeen при следующем выходе.
    if(state.roster[jid].presence !== 'online') queryLastActivity(jid);
  });

  // Восстанавливаем прошлый экран (persistLastScreen): был чат и контакт ещё в ростере - открываем его.
  // Иначе ничего: приложение и так открывается в списке контактов.
  if(!state.activeChat){
    const lastScreen = lastScreenStore.get();
    if(lastScreen?.screen === 'chat' && lastScreen.jid && state.roster[lastScreen.jid]){
      openChat(lastScreen.jid);
    }
  }
}

// XEP-0012: спрашиваем сервер контакта, сколько секунд назад он отключился. Работает, даже если мы были
// офлайн в момент его disconnect (в отличие от lastSeen из onPresence() в net/presence/incoming.js -
// он видит только переходы online->offline при нас). Нужен mod_last на сервере контакта; иначе
// ошибка (feature-not-implemented/service-unavailable) - остаётся прежнее, возможно менее точное значение.
async function queryLastActivity(jid){
  if(!state.connection?.connected) return;
  const iq = $iq({type: 'get', to: jid}).c('query', {xmlns: NS_LAST});
  const res = await sendIqSafe(iq, 10000);
  if(!res){
    debugLog('last-activity: запрос к ' + jid + ' не удался (сервер не поддерживает XEP-0012, либо контакт/сервер недоступны)');
    return;
  }
  const seconds = parseInt(res.querySelector('query')?.getAttribute('seconds'), 10);
  if(seconds >= 0){
    const ts = Date.now() - seconds * 1000;
    ensureChat(jid);
    // Значение сервера - источник истины для офлайн-контактов: основано на реальном disconnect.
    state.roster[jid].lastSeen = ts;
    lastSeenStore.set(jid, ts);
    renderRoster();
    if(state.activeChat === jid) renderChatHead();
  }
}

export async function addContact(jid){
  const iq = $iq({type:'set'}).c('query', {xmlns:'jabber:iq:roster'})
    .c('item', {jid});
  if(!(await sendIqSafe(iq))){
    toast(t('netRoster.addFailed'));
    return;
  }
  state.connection.send($pres({to: jid, type: 'subscribe'}));
  ensureChat(jid);
  // Ручное добавление - явное действие: контакт сразу доверенный для автозагрузки картинок
  // (riedchat-security-plan.md, п.5), без порога по числу сообщений.
  markContactTrusted(jid);
  renderRoster();
  toast(t('netRoster.requestSent'));
  loadDevices(jid, true);
}
