// ===================== ui/modals.js =====================
// Общая confirm-модалка и действие "очистить историю чата", которое её использует.
import { LS_KEY } from '../core/constants.js';
import { $, toast } from '../core/dom-utils.js';
import { clearLastScreen } from '../core/last-seen-storage.js';
import { state } from '../core/state.js';
import { lsRemove } from '../core/storage.js';
import { debugLog } from '../core/debug-log.js';
import { omemo } from '../crypto/omemo/state.js';
import { deleteSignalStore } from '../crypto/store.js';
import { history } from '../net/history.js';
import { renderMessages } from './chat-view/render-messages.js';
import { t } from '../i18n/t.js';

const S = state;

// ---------- ОБЩЕЕ ОКНО ПОДТВЕРЖДЕНИЯ ----------
// Возвращает Promise<boolean>: true если пользователь нажал кнопку подтверждения, false - при отмене/оверлее.
// opts.okText/opts.cancelText позволяют переопределить подписи кнопок (по умолчанию - деструктивный вариант
// "Удалить" / "Отмена", как исторически использовалось для очистки истории и логаута).
// opts.okDanger=false снимает красный деструктивный стиль с кнопки подтверждения (нужно для
// не-деструктивных подтверждений вроде отправки сообщения без шифрования).
export function confirm(title, desc, opts){
  opts = opts || {};
  return new Promise(resolve => {
    const modal = $('confirm-modal');
    $('confirm-title').textContent = title;
    $('confirm-desc').textContent = desc || '';
    const okBtn = $('confirm-ok');
    const cancelBtn = $('confirm-cancel');
    okBtn.textContent = opts.okText || t('modals.deleteBtn');
    cancelBtn.textContent = opts.cancelText || t('modals.cancelBtn');
    okBtn.style.background = opts.okDanger === false ? '' : '#b00020';
    okBtn.style.borderColor = opts.okDanger === false ? '' : '#b00020';
    modal.classList.add('active');

    const cleanup = (result) => {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlay);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlay = (e) => { if(e.target === modal) cleanup(false); };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlay);
  });
}

// ---------- ОЧИСТКА ИСТОРИИ ЧАТА ----------
export async function clearActiveChat(){
  const jid = S.activeChat;
  if(!jid) return;
  const name = (S.roster[jid] && S.roster[jid].name) || jid;
  const ok = await confirm(
    t('modals.clearChatTitle'),
    t('modals.clearChatDesc', { name })
  );
  if(!ok) return;
  S.messages[jid] = [];
  try{ await history.clearThread(jid); }
  catch(e){ console.warn('не удалось очистить историю в IndexedDB', e); }
  // renderMessages теперь потребляется напрямую.
  renderMessages();
  toast(t('modals.chatCleared'));
}

// ---------- ВЫХОД ИЗ АККАУНТА (с удалением всех локальных данных) ----------
// Рвём XMPP-соединение, забываем сохранённые логин/пароль и УДАЛЯЕМ с устройства
// всё, что накопилось для этого аккаунта: историю переписки + кэш медиа
// (chatHistory_<jid> в IndexedDB) и ключи/сессии OMEMO (omemoDb_<jid>).
// Это необратимо - собеседников не затрагивает, но на этом устройстве при
// следующем входе под тем же JID всё стартует с нуля (в т.ч. заново
// согласуются OMEMO-сессии с контактами).
export async function logout(){
  const jid = S.myBareJid || S.myJid || '';
  const ok = await confirm(
    t('modals.logoutTitle'),
    jid ? t('modals.logoutDescWithJid', { jid }) : t('modals.logoutDescNoJid')
  );
  if(!ok) return;
  try{ if(S.connection && omemo) await omemo.retractSelf(); }
  catch(e){ debugLog('[logout] retractSelf упал: ' + (e && e.message ? e.message : e)); }
  // Пользователь всё равно уходит из аккаунта - сломанный disconnect()
  // (например, сокет уже мёртв) не должен мешать дальнейшей очистке
  // локального состояния (lsRemove/clearLastScreen ниже).
  try{ if(S.connection) S.connection.disconnect(); }catch(e){}
  lsRemove(LS_KEY);
  clearLastScreen();
  if(jid){
    try{ await history.deleteAllForAccount(jid); }
    catch(e){ debugLog('[logout] не удалось удалить историю: ' + (e && e.message ? e.message : e)); }
    try{ await deleteSignalStore(jid); }
    catch(e){ debugLog('[logout] не удалось удалить ключи OMEMO: ' + (e && e.message ? e.message : e)); }
  }
  location.reload();
}
