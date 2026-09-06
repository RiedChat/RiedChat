// ============== features/message-select/mode.js ==============
// Управление режимом выбора: включение/выключение, переключение конкретной
// строки, переприменение UI после внешнего renderMessages().
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { msgIdByRow, setBarCount, applySelectionClasses } from './dom.js';

const S = state;

export function enterSelectMode(){
  if(S.selecting) return;
  S.selecting = new Set();
  const conv = $('conversation');
  if(conv) conv.classList.add('selecting');
  setBarCount();
}

export function exitSelectMode(){
  if(!S.selecting) return;
  S.selecting = null;
  const conv = $('conversation');
  if(conv) conv.classList.remove('selecting');
  applySelectionClasses();
  setBarCount();
}

// Переприменяет UI режима выбора после внешнего renderMessages() (например,
// пришло новое сообщение, пока пользователь отмечал старые) - сам режим и
// набор отмеченных id хранятся в S.selecting и renderMessages их не трогают,
// теряются только CSS-классы на пересозданных DOM-строках.
export function reapplySelectionUI(){
  if(!S.selecting) return;
  const conv = $('conversation');
  if(conv) conv.classList.add('selecting');
  applySelectionClasses();
  setBarCount();
}

export function toggleRow(row){
  const id = msgIdByRow(row);
  if(!id) return;
  if(!S.selecting) enterSelectMode();
  if(S.selecting.has(id)) S.selecting.delete(id);
  else S.selecting.add(id);
  row.classList.toggle('selected', S.selecting.has(id));
  setBarCount();
  if(S.selecting.size === 0) exitSelectMode();
}
