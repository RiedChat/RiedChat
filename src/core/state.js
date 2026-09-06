// ===================== core/state.js =====================
// Единый объект состояния приложения (runtime-данные текущей сессии).

export const state = {
  connection: null,
  myJid: '',
  myBareJid: '',
  myResource: '',
  roster: {},      // bareJid -> {name, presence, lastSeen}
                     // lastSeen: ms since epoch - момент, когда контакт последний раз
                     // ушёл в offline (см. net/presence/incoming.js:onPresence). Используется
                     // в шапке чата вместо "online" для офлайн-контактов (см. ui/chat-head.js).
  messages: {},     // bareJid -> [{body, time, out, encrypted, read}]
                     // read: false - входящее сообщение ещё не показывалось пользователю
                     // (чат не был открыт в момент получения); отсутствие поля (старые
                     // записи, отправленные сообщения) равнозначно read:true.
  activeChat: null,
  call: null,       // {id, bareJid, direction:'in'|'out', status, pc, localStream, remoteStream} | null
                     // status: 'ringing-out' | 'ringing-in' | 'connecting' | 'active' | 'ended'
                     // Ровно один активный звонок одновременно - см.
                     // features/call/call-manager.js. null = нет звонка (idle).
  uploadComponentJid: null,
  trustedUploadHosts: [], // хосты, которым разрешено доверять при скачивании aesgcm://-вложений:
                     // домен upload-компонента (disco#items) + фактические get/put-хосты,
                     // которые когда-либо вернул сервер на запрос слота (net/upload/slot.js).
                     // Ссылка на хост не из этого списка (например, подменённая MITM/вредоносным
                     // собеседником) отклоняется в net/media-worker/fetch-decrypt.js.
  replyTo: null,    // {author, text} | null - активная цитата над полем ввода (свайп-цитирование)
  editing: null,    // {id} | null - id редактируемого сейчас своего сообщения (см.
                     // features/message-edit.js). Взаимоисключающе с replyTo: начало
                     // редактирования сбрасывает цитату и наоборот.
  selecting: null,  // Set<string> сообщений (по msg.id), выбранных для удаления,
                     // или null - режим множественного выбора выключен (см.
                     // features/message-select.js). Пока это не null, свайп и
                     // редактирование сообщений отключены (см. msgByRow-гварды в
                     // features/message-edit/core.js и features/message-swipe/shared.js).
                     // Удаление затрагивает только это устройство - на сервер/собеседнику
                     // ничего не отправляется.
  lastPersistedAccount: null, // {wsUrl,jid,password} | null - то, что сейчас реально лежит в
                     // зашифрованном виде в LS_KEY (см. net/connection/connect.js persistAccount).
                     // Нужно, чтобы не перешифровывать и не дёргать биометрию/PIN повторно,
                     // если данные не изменились (автовход, тихий reconnect после разблокировки).
  vaultBlob: null,  // {account, omemoKeys} | null - расшифрованное содержимое LS_KEY, кэш на
                     // сессию (см. crypto/omemo-vault.js:getVaultBlob). Учётка и OMEMO data-key'и
                     // намеренно лежат в ОДНОМ зашифрованном блоке и расшифровываются/шифруются
                     // ОДНИМ вызовом vault.decrypt/encrypt - иначе на android-native, где каждая
                     // такая операция - отдельный BiometricPrompt, логин с "запомнить на
                     // устройстве" спрашивал бы отпечаток дважды подряд (один раз на учётку,
                     // другой - на OMEMO-ключ).
  plaintextFallbackDecision: {}, // bareJid -> 'allow'|'block', только на текущую сессию (не персистится).
                     // Заполняется в net/messaging/outgoing.js:sendMessage() после того, как
                     // пользователь один раз явно ответил на модалку «отправить незашифрованным?»
                     // для этого чата - чтобы не спрашивать на каждое сообщение подряд.
};
