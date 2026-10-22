// ===================== core/last-seen-storage.js =====================
// Persist "был(а) в сети" и последнего экрана в localStorage, отдельно от XMPP-логики.
import { accountValue, accountMap } from './storage.js';

// ---------------- LAST SEEN ----------------
// Сервер историю presence не хранит: считаем по увиденному вживую переходу online->offline
// (net/presence/incoming.js:onPresence) и сохраняем, чтобы не терять после перезагрузки.
export const lastSeenStore = accountMap('xmppLastSeen');

// ---------------- LAST SCREEN ----------------
// Для восстановления экрана при входе (чат или список контактов). Отдельно на аккаунт.
export const lastScreenStore = accountValue('xmppLastScreen');
export const persistLastScreen = (jid) =>
  lastScreenStore.set(jid ? { screen: 'chat', jid } : { screen: 'contacts' });
