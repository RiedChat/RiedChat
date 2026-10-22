import { NS_CHAT_MARKERS } from '../../core/constants.js';
import { state } from '../../core/state.js';
import { patchMessageTicks } from '../../ui/chat-view/render-messages.js';
import { history } from '../history.js';

export function sendDisplayedMarker(toJid, msgId){
  if(!msgId || !state.connection) return;
  const marker = $msg({to: toJid, type:'chat', id: crypto.randomUUID()})
    .c('displayed', {xmlns: NS_CHAT_MARKERS, id: msgId});
  state.connection.send(marker);
}

// Отмечает наши исходящие в чате fromBare как "прочитано" до сообщения с id === markerId включительно
// (по XEP-0333 показ одного означает, что более ранние тоже увидены).
export function handleDisplayedMarker(fromBare, markerId){
  const list = state.messages[fromBare];
  if(!list || !markerId) return;
  const idx = list.findIndex(m => m?.out && m.id === markerId);
  if(idx === -1) return;  // напр. маркер для сообщения, которого ещё нет в локальной истории
  const changedIdx = [];
  list.slice(0, idx + 1).forEach((m, i) => {
    if(m?.out && m.status !== 'read'){ m.status = 'read'; changedIdx.push(i); }
  });
  if(!changedIdx.length) return;
  history.saveThread(fromBare, list);
  // Обновляем только .ticks затронутых строк: полный renderMessages() пересоздавал весь DOM списка
  // (<img>/<video>/<audio>) и обрывал играющее голосовое (riedchat-perf-notes.md, п.1).
  if(state.activeChat === fromBare) changedIdx.forEach(i => patchMessageTicks(i));
}
