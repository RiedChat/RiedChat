// ============== features/message-select/delete.js ==============
// Удаление отмеченного - только с этого устройства (перезапись локальной истории в IndexedDB, на сервер ничего не уходит).
import { toast } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { history } from '../../net/history.js';
import { renderMessages } from '../../ui/chat-view/render-messages.js';
import { confirmDialog } from '../../ui/confirm-modal.js';

import { exitSelectMode } from './mode.js';

export async function deleteSelected(){
  if(!state.selecting || state.selecting.size === 0) return;
  const jid = state.activeChat;
  if(!jid) return;
  const ids = state.selecting;
  const count = ids.size;
  const ok = await confirmDialog(
    count === 1 ? t('select.deleteOneConfirm') : t('select.deleteManyConfirm', {count}),
    t('select.deleteDesc')
  );
  if(!ok) return;
  const list = state.messages[jid] || [];
  state.messages[jid] = list.filter(m => !(m && ids.has(m.id)));
  await history.saveThread(jid, state.messages[jid], { now: true, context: t('select.deletingMessagesLabel') });
  exitSelectMode();
  renderMessages();
  toast(count === 1 ? t('select.oneDeleted') : t('select.manyDeleted'));
}
