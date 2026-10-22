// ===================== net/turn/extdisco.js =====================
// XEP-0215 (External Service Discovery): просим СВОЙ XMPP-сервер отдать TURN/STUN-сервисы
// (обычно с временными креденшлами), а не прошиваем TURN в клиенте. Если сервер не умеет XEP-0215
// (ошибка или нет ответа за IQ_TIMEOUT_MS) - фоллбек: TURN-адрес на дефолтных портах из домена
// JID (после «@», см. deriveTurnFromDomain), в расчёте на coturn/аналог на том же хосте.
// Креденшлов в этом случае нет: anonymous-only TURN сработает, иначе вызывающий код
// (features/call/peer-connection.js) остаётся на голом STUN (за симметричным NAT звонок может не пройти).
import { NS_EXTDISCO } from '../../core/constants.js';
import { debugLog } from '../../core/debug-log.js';
import { sendIqSafe } from '../../core/iq.js';
import { state } from '../../core/state.js';

const STUN_FALLBACK = [{ urls: 'stun:stun.l.google.com:19302' }];

function serviceToIceServer(svc){
  const type = svc.getAttribute('type');  // 'turn' | 'turns' | 'stun'
  const host = svc.getAttribute('host');
  const port = svc.getAttribute('port');
  if(!host || !port || !type) return null;
  const transport = svc.getAttribute('transport');  // 'udp' | 'tcp', необязателен по XEP
  const scheme = type === 'turns' ? 'turns' : (type === 'turn' ? 'turn' : 'stun');
  let urls = scheme + ':' + host + ':' + port;
  if(transport && scheme !== 'stun') urls += '?transport=' + transport;
  const entry = { urls };
  const username = svc.getAttribute('username');
  const password = svc.getAttribute('password');
  if(username) entry.username = username;
  if(password) entry.credential = password;
  return entry;
}

// IQ get к домену аккаунта: extdisco в XEP-0215 адресуется прямо серверу (как net/upload/slot.js:
// discoverUploadComponent, но без disco#items).
async function requestExtDisco(){
  if(!state.connection || !state.myJid) return [];
  const iq = $iq({type:'get', to: Strophe.getDomainFromJid(state.myJid)})
    .c('services', {xmlns: NS_EXTDISCO});
  const res = await sendIqSafe(iq);
  if(!res){
    debugLog('[turn] extdisco: сервер не поддерживает XEP-0215 или не ответил - пробуем фоллбек');
    return [];
  }
  const servers = [];
  res.querySelectorAll('services > service').forEach(svc => {
    const entry = serviceToIceServer(svc);
    if(entry) servers.push(entry);
  });
  debugLog('[turn] extdisco: сервер вернул ' + servers.length + ' сервис(ов)');
  return servers;
}

// Дефолтные порты TURN/TURNS (RFC 5766 / RFC 5928), если сервер не указал порт в XEP-0215.
const TURN_PORT = 3478;
const TURNS_PORT = 5349;

// Фоллбек без XEP-0215: домен из JID (state.myJid, net/connection/connect.js) + дефолтные порты, без креденшлов.
// Сработает при анонимном доступе coturn (или allow-list по IP); при auth - как обычная ICE-ошибка,
// остаётся голый STUN.
function deriveTurnFromDomain(){
  if(!state.myJid) return [];
  const domain = Strophe.getDomainFromJid(state.myJid);
  if(!domain) return [];
  debugLog('[turn] extdisco недоступен - пробуем домен аккаунта ' + domain + ' на дефолтных портах');
  return [
    { urls: 'turn:' + domain + ':' + TURN_PORT + '?transport=udp' },
    { urls: 'turn:' + domain + ':' + TURN_PORT + '?transport=tcp' },
    { urls: 'turns:' + domain + ':' + TURNS_PORT + '?transport=tcp' },
  ];
}

// Ephemeral TURN-креденшлы короткоживущие - НЕ кэшируем, запрашиваем перед каждым startCall/acceptCall.
export async function getIceServers(){
  let turnServers = await requestExtDisco();
  if(turnServers.length === 0) turnServers = deriveTurnFromDomain();
  return STUN_FALLBACK.concat(turnServers);
}
