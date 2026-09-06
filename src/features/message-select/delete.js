// ============== features/message-select/delete.js ==============
// Удаление отмеченного - ТОЛЬКО с этого устройства (перезаписываем локальную
// историю в IndexedDB, на сервер/собеседнику ничего не отправляется - ни
// retraction-станза, ни что-либо ещё).
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { history } from '../../net/history.js';
import { renderMessages } from '../../ui/chat-view/render-messages.js';
import { confirm } from '../../ui/modals.js';
import { exitSelectMode } from './mode.js';
import { t } from '../../i18n/t.js';

const S = state;

export async function deleteSelected(){
  if(!S.selecting || S.selecting.size === 0) return;
  const jid = S.activeChat;
  if(!jid) return;
  const ids = S.selecting;
  const count = ids.size;
  const ok = await confirm(
    count === 1 ? t('select.deleteOneConfirm') : t('select.deleteManyConfirm', {count}),
    t('select.deleteDesc')
  );
  if(!ok) return;
  const list = S.messages[jid] || [];
  S.messages[jid] = list.filter(m => !(m && ids.has(m.id)));
  try{
    await history.saveThread(jid, S.messages[jid]);
  }catch(e){
    history.reportWriteError(e, t('select.deletingMessagesLabel'));
  }
  exitSelectMode();
  renderMessages();
  toast(count === 1 ? t('select.oneDeleted') : t('select.manyDeleted'));
}
