// ============== features/message-select/mode.js ==============
// Режим выбора: включение/выключение, переключение строки, синхронизация UI с state.selecting.
import { $ } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';

import { msgIdByRow, setBarCount, applySelectionClasses } from './dom.js';

// Приводит UI к state.selecting: класс режима на контейнере, "selected" на строках, счётчик. Вызывается при входе/выходе и после внешнего renderMessages();
// режим и id хранятся в state.selecting, теряются только CSS-классы на пересозданных строках.
export function syncSelectionUI(){
  const conv = $('conversation');
  if(conv) conv.classList.toggle('selecting', !!state.selecting);
  applySelectionClasses();
  setBarCount();
}

export function exitSelectMode(){
  if(!state.selecting) return;
  state.selecting = null;
  syncSelectionUI();
}

export function toggleRow(row){
  const id = msgIdByRow(row);
  if(!id) return;
  if(!state.selecting){
    state.selecting = new Set();
    syncSelectionUI();
  }
  if(state.selecting.has(id)) state.selecting.delete(id);
  else state.selecting.add(id);
  row.classList.toggle('selected', state.selecting.has(id));
  setBarCount();
  if(state.selecting.size === 0) exitSelectMode();
}
