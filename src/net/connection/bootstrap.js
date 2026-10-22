// ===================== net/connection/bootstrap.js =====================
// Инициализация после логина (вызывается из connect.js по CONNECTED); шаги - отдельные функции.
import { NS_DISCO_INFO } from '../../core/constants.js';
import { debugLog, errMsg } from '../../core/debug-log.js';
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { omemo } from '../../crypto/omemo/state.js';
import { renderAvatarButton } from '../../features/profile/avatar.js';
import { applyWallpaper } from '../../features/wallpaper/modal.js';
import { t } from '../../i18n/t.js';
import { updateOmemoBadge } from '../../ui/chat-head.js';
import { showApp } from '../../ui/login-screen.js';
import { history } from '../history.js';
import { onMessage } from '../messaging/incoming.js';
import { broadcastPresence, onDiscoInfoIq } from '../presence/caps.js';
import { onPresence } from '../presence/incoming.js';
import { fetchRoster } from '../roster.js';
import { discoverUploadComponent } from '../upload/slot.js';

export async function onLoggedIn(){
  showApp();
  renderAvatarButton();
  applyWallpaper();

  state.connection.addHandler(onMessage, null, 'message', null, null, null);
  state.connection.addHandler(onPresence, null, 'presence', null, null, null);
// Отвечаем на disco#info тем же списком фич, что в caps hash - иначе контакты не примут наш hash
// и не подпишутся на device-list.
  state.connection.addHandler(onDiscoInfoIq, NS_DISCO_INFO, 'iq', 'get', null, null);

// Грузим локальную историю ДО fetchRoster(), иначе он создаст пустые треды поверх неё.
  await _initHistory();

// Анонсируем omemo:2:devices+notify через XEP-0115 (+ ник/аватар, см. presence/caps.js:broadcastPresence) -
// так приходят push-уведомления о device-list, без форс-рефреша перед отправкой.
  await broadcastPresence();

  await _initOmemo();

  fetchRoster();
  discoverUploadComponent();
}

async function _initHistory(){
  try{
    await history.init(state.myBareJid);
    const saved = await history.loadAll();
    Object.keys(saved).forEach(jid => { state.messages[jid] = saved[jid] || []; });
  }catch(e){
    console.warn('не удалось загрузить сохранённую историю переписки', e);
    debugLog('[history] инициализация не удалась: ' + errMsg(e) + ' - работаем без локальной истории в этой сессии');
// Показываем ошибку пользователю - молчаливое зависание на этом шаге выглядело как "ничего не работает".
    toast(t('connection.loadHistoryFailed', {detail: errMsg(e)}));
// history.db остаётся null - методы history.js в этом случае no-op, остальная инициализация не блокируется.
  }
}

async function _initOmemo(){
  toast(t('connection.settingUpOmemo'));
  try{
    await omemo.init(state.connection, state.myBareJid);
  }catch(e){
    console.error('OMEMO init непойманная ошибка', e);
    toast(t('connection.omemoUnavailable', {detail: errMsg(e)}));
  }
  updateOmemoBadge();
  if(omemo.ready) toast(t('connection.omemoReady'));
}
