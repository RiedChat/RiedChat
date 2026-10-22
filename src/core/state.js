// ===================== core/state.js =====================
// Единый объект состояния приложения (runtime-данные текущей сессии).

export const state = {
  connection: null,
  myJid: '',
  myBareJid: '',
  myResource: '',
  // bareJid -> {name, presence, lastSeen}; lastSeen - мс, когда контакт последний раз ушёл в offline
  // (net/presence/incoming.js:onPresence), показывается в ui/chat-head.js
  roster: {},
  // bareJid -> [{body, time, out, encrypted, read}]; read:false - входящее ещё не показано, нет поля = true
  messages: {},
  activeChat: null,
  // {id, bareJid, direction:'in'|'out', status, pc, localStream, remoteStream} | null; один звонок за раз
  // (features/call/call-state.js). status: 'ringing-out' | 'ringing-in' | 'connecting' | 'active' | 'ended'
  call: null,
  uploadComponentJid: null,
  // Доверенные хосты aesgcm://-вложений: upload-компонент (disco#items) + get/put-хосты из ответов слота
  // (net/upload/slot.js). Остальные отклоняет net/media-worker/fetch-decrypt.js.
  trustedUploadHosts: [],
  replyTo: null,    // {author, text} | null - активная цитата над полем ввода
  // {id} | null - редактируемое своё сообщение (features/message-edit.js); взаимоисключающе с replyTo
  editing: null,
  // Set<msg.id> выбранных для удаления либо null (режим выключен; features/message-select/). Пока не null, свайп и
  // редактирование отключены. Удаление только локальное.
  selecting: null,
  // {wsUrl,jid,password} | null - то, что сейчас зашифровано в LS_KEY (net/connection/connect.js persistAccount);
  // чтобы не перешифровывать и не дёргать биометрию/PIN зря
  lastPersistedAccount: null,
  // {account, omemoKeys} | null - расшифрованный LS_KEY, кэш на сессию (crypto/omemo-vault.js:getVaultBlob).
  // Учётка и OMEMO-ключи в одном блоке - один vault.decrypt/encrypt, иначе на android-native BiometricPrompt
  // спрашивался бы дважды.
  vaultBlob: null,
};

// Создаёт запись ростера и тред сообщений для jid, если их ещё нет.
export function ensureChat(jid){
  state.roster[jid] ??= {name: jid.split('@')[0], presence: 'offline'};
  state.messages[jid] ??= [];
}

// Сообщения чата jid (пустой массив, если треда нет).
export const messagesOf = jid => state.messages[jid] || [];

// Сообщения активного чата (пустой массив, если чат не выбран или треда нет).
export const activeMessages = () => messagesOf(state.activeChat);
