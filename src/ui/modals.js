// ===================== ui/modals.js =====================
// «Очистить историю чата» и «выйти из аккаунта» (через confirmDialog из ui/confirm-modal.js).
import { LS_KEY } from '../core/constants.js';
import { attempt } from '../core/debug-log.js';
import { toast, contactName } from '../core/dom-utils.js';
import { lastScreenStore } from '../core/last-seen-storage.js';
import { state } from '../core/state.js';
import { lsRemove } from '../core/storage.js';
import { omemo } from '../crypto/omemo/state.js';
import { deleteSignalStore } from '../crypto/store.js';
import { t } from '../i18n/t.js';
import { history } from '../net/history.js';

import { renderMessages } from './chat-view/render-messages.js';
import { confirmDialog } from './confirm-modal.js';

// ---------- ОЧИСТКА ИСТОРИИ ЧАТА ----------
export async function clearActiveChat(){
  const jid = state.activeChat;
  if(!jid) return;
  const name = contactName(jid);
  const ok = await confirmDialog(
    t('modals.clearChatTitle'),
    t('modals.clearChatDesc', { name })
  );
  if(!ok) return;
  state.messages[jid] = [];
  await attempt('history', 'не удалось очистить историю в IndexedDB', () => history.clearThread(jid));
  renderMessages();
  toast(t('modals.chatCleared'));
}

// Шаги очистки при выходе идут через attempt: ошибка пишется в debug-лог и не прерывает остальные шаги.
// ---------- ВЫХОД ИЗ АККАУНТА (с удалением локальных данных) ----------
// Рвём XMPP-соединение, забываем логин/пароль и удаляем с устройства историю и кэш медиа (chatHistory_<jid> в IndexedDB) и ключи/сессии OMEMO (omemoDb_<jid>). Необратимо; собеседников не затрагивает, но при следующем входе под тем же JID всё начнётся с нуля (включая OMEMO-сессии).
export async function logout(){
  const jid = state.myBareJid || state.myJid || '';
  const ok = await confirmDialog(
    t('modals.logoutTitle'),
    jid ? t('modals.logoutDescWithJid', { jid }) : t('modals.logoutDescNoJid')
  );
  if(!ok) return;
  await attempt('logout', 'retractSelf упал', async () => { if(state.connection) await omemo.retractSelf(); });
  // Сломанный disconnect() (например, сокет мёртв) не должен мешать очистке локального состояния (lsRemove/lastScreenStore ниже).
  await attempt('logout', 'disconnect упал', () => { if(state.connection) state.connection.disconnect(); });
  lsRemove(LS_KEY);
  lastScreenStore.set(null);
  if(jid){
    await attempt('logout', 'не удалось удалить историю', () => history.deleteAllForAccount(jid));
    await attempt('logout', 'не удалось удалить ключи OMEMO', () => deleteSignalStore(jid));
  }
  location.reload();
}
