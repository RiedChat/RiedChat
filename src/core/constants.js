// ===================== core/constants.js =====================
// XMPP-неймспейсы и прочие константы, общие для всех модулей.

export const NS_HTTPUPLOAD = 'urn:xmpp:http:upload:0';
export const NS_OMEMO = 'urn:xmpp:omemo:2';               // XEP-0384 (актуальная версия протокола, единственная поддерживаемая)
export const NS_OMEMO_DEVICES = NS_OMEMO + ':devices';
export const NS_OMEMO_BUNDLES_PREFIX = NS_OMEMO + ':bundles:';
export const NS_PUBSUB = 'http://jabber.org/protocol/pubsub';
export const NS_PUBSUB_EVENT = NS_PUBSUB + '#event';
export const NS_HINTS = 'urn:xmpp:hints';
export const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info';
// XEP-0115 Entity Capabilities - нужен, чтобы (а) наши контакты узнавали через presence,
// что мы поддерживаем urn:xmpp:omemo:2:devices+notify, и их сервер автоматически
// подписывал нас на события их device-list узла; и (б) чтобы мы сами отвечали на
// чужие disco#info запросы к нам тем же списком фич - без этого push-уведомления
// о смене чужого/своего device-list просто не приходят, и приходится опрашивать
// PEP вручную перед каждой отправкой.
export const NS_CAPS = 'http://jabber.org/protocol/caps';
export const CAPS_NODE = 'https://riedchat.example/caps';
// XEP-0333 Chat Markers - используется для галочек "прочитано" (как в Telegram):
// исходящее сообщение помечается <markable/>, получатель в ответ шлёт
// <displayed id='...'/>, когда реально показал сообщение пользователю.
export const NS_CHAT_MARKERS = 'urn:xmpp:chat-markers:0';
// XEP-0172 - псевдоним (никнейм), который рассылается в presence и виден
// контактам вместо локальной части JID. XEP-0153/vcard-temp - классический
// способ раздать свой аватар: сам файл хранится в vCard на сервере, а в
// presence мы анонсируем только SHA-1 хэш текущей фотографии (photo), чтобы
// получатели перекачивали vCard только когда хэш реально изменился.
export const NS_NICK = 'http://jabber.org/protocol/nick';
export const NS_VCARD = 'vcard-temp';
export const NS_VCARD_UPDATE = 'vcard-temp:x:update';
// XEP-0012 Last Activity - запрос к серверу контакта "сколько секунд назад
// он последний раз отключился". В отличие от presence-based lastSeen (см.
// net/connection.js), это даёт точное время даже если МЫ сами были офлайн
// в момент, когда контакт вышел из сети - сервер хранит это независимо от
// того, кто в этот момент был подписан и онлайн.
export const NS_LAST = 'jabber:iq:last';
// XEP-0308 Last Message Correction - позволяет заменить текст уже отправленного
// сообщения "на месте": новая станза несёт тот же текст-заглушку/тело, что и
// обычное сообщение, плюс <replace id='...'/>, где id - id исправляемого
// сообщения. См. net/messaging/outgoing.js:editMessage и
// net/messaging/incoming.js (обработка входящих исправлений).
export const NS_LAST_MESSAGE_CORRECTION = 'urn:xmpp:message-correct:0';

// Свой (не XEP) неймспейс для сигналинга звонков поверх голого RTCPeerConnection.
// <call-signal xmlns=NS_CALL type="offer|answer|candidate|decline|hangup|busy" id="...">
// стоит открытым текстом рядом с <encrypted> - тип сигнала должен быть виден
// ДО расшифровки OMEMO, чтобы net/messaging/incoming/early-handlers.js мог
// отличить звонок от обычного сообщения и не пропустить его в S.messages (см.
// net/messaging/incoming/call-signal.js). Сам SDP/ICE payload идёт только
// внутри <encrypted> - здесь наружу торчит исключительно факт и тип
// call-события, как уже торчит факт <displayed>/<replace> у чат-маркеров.
export const NS_CALL = 'riedchat:call:0';
export const CALL_SIGNAL_TYPES = ['offer', 'answer', 'candidate', 'decline', 'hangup', 'busy'];

// XEP-0215 External Service Discovery - запрос списка TURN/STUN-серверов у
// собственного XMPP-сервера (см. net/turn/extdisco.js).
export const NS_EXTDISCO = 'urn:xmpp:extdisco:2';

// Таймаут ожидания ответа сервера на IQ-запросы (vCard, upload slot, MAM,
// OMEMO bundle/device-list) - раньше был продублирован как одинаковая
// локальная константа (15000) в 5 разных файлах.
export const IQ_TIMEOUT_MS = 15000;

export const LS_KEY = 'xmppChatCreds';

// Отдельный от LS_KEY, НЕзашифрованный ключ - просто последний использованный
// адрес WebSocket-сервера. wsUrl не секрет (в отличие от JID/пароля в
// LS_KEY-vault), поэтому хранится в обычном localStorage и не требует
// vault.unlock()/биометрии, чтобы просто предзаполнить поле на экране логина.
// Пишется при КАЖДОМ успешном коннекте (см. net/connection/connect.js),
// независимо от чекбокса "запомнить на устройстве".
export const LAST_WS_URL_KEY = 'riedchatLastWsUrl';

// Ни одного реального домена в константах больше нет: до первого успешного
// коннекта поле ws-url на экране логина просто пустое (см.
// ui/login-screen.js:initLoginDefaults) - единственный источник значения
// после этого - LAST_WS_URL_KEY в localStorage. EXAMPLE_WS_URL - только
// текст-подсказка в placeholder, никогда не подставляется как value.
export const EXAMPLE_WS_URL = 'wss://example.com:5281/xmpp-websocket';

export const EXAMPLE_JID = 'user@example.com';
