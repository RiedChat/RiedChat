// ===================== core/constants.js =====================
// XMPP-неймспейсы и прочие константы, общие для всех модулей.

export const NS_HTTPUPLOAD = 'urn:xmpp:http:upload:0';
export const NS_OMEMO = 'urn:xmpp:omemo:2';               // XEP-0384, единственная поддерживаемая версия
export const NS_OMEMO_DEVICES = NS_OMEMO + ':devices';
export const NS_OMEMO_BUNDLES_PREFIX = NS_OMEMO + ':bundles:';
export const NS_PUBSUB = 'http://jabber.org/protocol/pubsub';
export const NS_PUBSUB_EVENT = NS_PUBSUB + '#event';
export const NS_HINTS = 'urn:xmpp:hints';
export const NS_DISCO_INFO = 'http://jabber.org/protocol/disco#info';
// XEP-0115 Entity Capabilities: контакты узнают из presence про omemo:2:devices+notify, а мы отвечаем на их
// disco#info - иначе push об изменении device-list не приходит и PEP приходится опрашивать вручную.
export const NS_CAPS = 'http://jabber.org/protocol/caps';
export const CAPS_NODE = 'https://riedchat.example/caps';
// XEP-0333 Chat Markers: исходящее помечается <markable/>, получатель шлёт <displayed id='...'/> после показа (галочки "прочитано").
export const NS_CHAT_MARKERS = 'urn:xmpp:chat-markers:0';
// XEP-0172 Nick: псевдоним в presence. XEP-0153/vcard-temp: аватар лежит в vCard, в presence анонсируется
// только SHA-1 хэш (photo) - vCard перекачивается при смене хэша.
export const NS_NICK = 'http://jabber.org/protocol/nick';
export const NS_VCARD = 'vcard-temp';
export const NS_VCARD_UPDATE = 'vcard-temp:x:update';
// XEP-0012 Last Activity: время последнего отключения контакта, хранимое его сервером. Точнее presence-based
// lastSeen (net/connection.js): работает, даже если мы были офлайн в момент выхода.
export const NS_LAST = 'jabber:iq:last';
// XEP-0308 Last Message Correction: <replace id='...'/> с id исправляемого сообщения
// (net/messaging/outgoing.js:editMessage, net/messaging/incoming.js).
export const NS_LAST_MESSAGE_CORRECTION = 'urn:xmpp:message-correct:0';

// Не XEP: сигналинг звонков поверх RTCPeerConnection. <call-signal type="offer|answer|candidate|decline|hangup|busy" id="...">
// лежит открыто рядом с <encrypted>, чтобы early-handlers.js отличил звонок до расшифровки OMEMO и не пустил
// его в state.messages (net/messaging/incoming/call-signal.js). SDP/ICE - только внутри <encrypted>.
export const NS_CALL = 'riedchat:call:0';

// XEP-0215 External Service Discovery: список TURN/STUN у своего сервера (net/turn/extdisco.js).
export const NS_EXTDISCO = 'urn:xmpp:extdisco:2';

// Таймаут IQ-запросов (vCard, upload slot, OMEMO).
export const IQ_TIMEOUT_MS = 15000;

export const LS_KEY = 'xmppChatCreds';

// Последний wsUrl: не секрет, хранится открыто (без vault.unlock()) для предзаполнения логина.
// Пишется при каждом успешном коннекте (net/connection/connect.js), независимо от "запомнить".
export const LAST_WS_URL_KEY = 'riedchatLastWsUrl';

// Реальных доменов нет: до первого коннекта ws-url на экране логина пуст (ui/login-screen.js:initLoginDefaults),
// затем берётся LAST_WS_URL_KEY. EXAMPLE_WS_URL - только placeholder.
export const EXAMPLE_WS_URL = 'wss://example.com:5281/xmpp-websocket';

export const EXAMPLE_JID = 'user@example.com';
