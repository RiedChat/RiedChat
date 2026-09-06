// ===================== net/connection/bootstrap.js =====================
// Последовательность инициализации сразу после успешного логина (вызывается
// из net/connection/connect.js по Strophe.Status.CONNECTED). Каждый шаг -
// отдельная функция, чтобы было видно порядок зависимостей и можно было
// тестировать/переставлять шаги независимо.
import { NS_DISCO_INFO } from '../../core/constants.js';
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { omemo } from '../../crypto/omemo/state.js';
import { debugLog } from '../../core/debug-log.js';
import { history } from '../history.js';
import { mam } from '../mam.js';
import { broadcastPresence } from '../presence/caps.js';
import { onDiscoInfoIq } from '../presence/disco.js';
import { onPresence } from '../presence/incoming.js';
import { onMessage } from '../messaging/incoming.js';
import { discoverUploadComponent } from '../upload/slot.js';
import { fetchRoster } from '../roster.js';
import { showApp } from '../../ui/login-screen.js';
import { updateOmemoBadge } from '../../ui/chat-head.js';
import { refreshMyAvatarButton } from '../../features/profile.js';
import { applyWallpaper } from '../../features/wallpaper/modal.js';
import { t } from '../../i18n/t.js';

const S = state;

export async function onLoggedIn(){
  showApp();
  refreshMyAvatarButton();
  applyWallpaper();

  S.connection.addHandler(onMessage, null, 'message', null, null, null);
  S.connection.addHandler(onPresence, null, 'presence', null, null, null);
  // Отвечаем на чужие disco#info-запросы к нам (в т.ч. к bare JID) тем же
  // списком фич, что и в caps hash из presence - иначе контакты не могут
  // подтвердить наш hash и не подпишутся на push-уведомления о device-list.
  S.connection.addHandler(onDiscoInfoIq, NS_DISCO_INFO, 'iq', 'get', null, null);

  // подгружаем сохранённую на этом устройстве историю переписки ДО того,
  // как fetchRoster() создаст пустые треды для контактов - так старые
  // сообщения не потеряются при повторном входе.
  await _initHistory();

  // Анонсируем поддержку omemo:2:devices+notify через XEP-0115 caps (и заодно
  // свой псевдоним/аватар, если они настроены - см. net/presence/caps.js:broadcastPresence)
  // - это и есть механизм, из-за которого контакты (и мы сами про себя)
  // начинают получать push-уведомления о смене device-list вместо
  // форс-рефреша перед каждой отправкой.
  await broadcastPresence();

  await _initOmemo();

  fetchRoster();
  discoverUploadComponent();

  _syncMamInBackground();
}

async function _initHistory(){
  try{
    await history.init(S.myBareJid);
    const saved = await history.loadAll();
    Object.keys(saved).forEach(jid => { S.messages[jid] = saved[jid] || []; });
  }catch(e){
    console.warn('не удалось загрузить сохранённую историю переписки', e);
    debugLog('[history] инициализация не удалась: ' + (e && e.message ? e.message : e) + ' - работаем без локальной истории в этой сессии');
    // Раньше эта ошибка была видна только в консоли; теперь показываем
    // пользователю, т.к. именно молчаливое зависание на этом шаге раньше
    // выглядело как "ничего не работает после входа" без единой подсказки.
    toast(t('connection.loadHistoryFailed', {detail: e && e.message ? e.message : e}));
    // history.db остаётся null - все методы history.js уже написаны так,
    // чтобы аккуратно no-op'ать в этом случае (см. проверки `if(!this.db)`),
    // так что дальнейшая инициализация (роутер/OMEMO/MAM) не блокируется.
  }
}

async function _initOmemo(){
  toast(t('connection.settingUpOmemo'));
  try{
    await omemo.init(S.connection, S.myBareJid);
  }catch(e){
    console.error('OMEMO init непойманная ошибка', e);
    toast(t('connection.omemoUnavailable', {detail: e && e.message ? e.message : e}));
  }
  updateOmemoBadge();
  if(omemo.ready) toast(t('connection.omemoReady'));
}

function _syncMamInBackground(){
  // Синхронизация истории с сервером через MAM - в фоне, не блокируя UI.
  // Если сервер её не поддерживает, checkSupport() внутри тихо это обнаружит и выйдет.
  mam.syncAccount().catch(e => {
    console.warn('MAM sync непойманная ошибка', e);
    debugLog('MAM: непойманная ошибка синхронизации - ' + (e && e.message ? e.message : e));
  });
}
