// ===================== net/turn/extdisco.js =====================
// XEP-0215 (External Service Discovery): просим СВОЙ XMPP-сервер отдать
// список TURN/STUN-сервисов (обычно с временными креденшлами) вместо того,
// чтобы жёстко прошивать TURN в клиенте. Если сервер не умеет XEP-0215
// (ответит ошибкой, например feature-not-implemented, либо вообще не
// ответит за IQ_TIMEOUT_MS) - тихий фоллбек: берём домен из JID, которым
// пользователь только что успешно авторизовался (часть после «@»), и
// собираем из него TURN-адрес на дефолтных портах (см.
// deriveTurnFromDomain ниже) - предполагается, что тот же хост держит
// coturn/аналог на стандартных портах. Креденшлов у нас в этом случае нет
// (сервер не отдал их через extdisco) - часть TURN-серверов anonymous-only
// либо потребуют их дополнительно; если и это не сработает - вызывающий
// код (features/call/call-manager.js) остаётся на голом STUN (звонок между
// двумя устройствами за симметричным NAT может не пройти, но однозначно не
// сломается).
import { IQ_TIMEOUT_MS, NS_EXTDISCO } from '../../core/constants.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';

const S = state;

const STUN_FALLBACK = [{ urls: 'stun:stun.l.google.com:19302' }];

function serviceToIceServer(svc){
  const type = svc.getAttribute('type'); // 'turn' | 'turns' | 'stun'
  const host = svc.getAttribute('host');
  const port = svc.getAttribute('port');
  if(!host || !port || !type) return null;
  const transport = svc.getAttribute('transport'); // 'udp' | 'tcp', необязателен по XEP
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

// IQ get к домену аккаунта (не к отдельному компоненту - extdisco в XEP-0215
// адресуется прямо на сервер, по аналогии с net/upload/slot.js:discoverUploadComponent,
// только без промежуточного disco#items).
function requestExtDisco(){
  return new Promise((resolve) => {
    if(!S.connection || !S.myJid){ resolve([]); return; }
    const iq = $iq({type:'get', to: Strophe.getDomainFromJid(S.myJid)})
      .c('services', {xmlns: NS_EXTDISCO});
    S.connection.sendIQ(iq, (res) => {
      const services = res.querySelectorAll('services > service');
      const servers = [];
      services.forEach(svc => {
        const entry = serviceToIceServer(svc);
        if(entry) servers.push(entry);
      });
      debugLog('[turn] extdisco: сервер вернул ' + servers.length + ' сервис(ов)');
      resolve(servers);
    }, () => {
      debugLog('[turn] extdisco: сервер не поддерживает XEP-0215 или не ответил - пробуем фоллбек');
      resolve([]);
    }, IQ_TIMEOUT_MS);
  });
}

// Дефолтные TURN/TURNS-порты (RFC 5766 / RFC 5928) - используются, когда
// сервер сам не подсказал порт через XEP-0215.
const TURN_PORT = 3478;
const TURNS_PORT = 5349;

// Фоллбек без XEP-0215: домен из JID, которым пользователь только что
// вошёл (S.myJid, см. net/connection/connect.js), + дефолтные порты.
// Без креденшлов - если coturn на этом хосте настроен на анонимный доступ
// (или временный allow-list по IP), звонок пройдёт; если требует auth -
// TURN этот отвалится тем же путём, что и обычная сетевая ошибка ICE, и
// звонок останется на голом STUN.
function deriveTurnFromDomain(){
  if(!S.myJid) return [];
  const domain = Strophe.getDomainFromJid(S.myJid);
  if(!domain) return [];
  debugLog('[turn] extdisco недоступен - пробуем домен аккаунта ' + domain + ' на дефолтных портах');
  return [
    { urls: 'turn:' + domain + ':' + TURN_PORT + '?transport=udp' },
    { urls: 'turn:' + domain + ':' + TURN_PORT + '?transport=tcp' },
    { urls: 'turns:' + domain + ':' + TURNS_PORT + '?transport=tcp' },
  ];
}

// Ephemeral TURN-креденшлы обычно короткоживущие - намеренно НЕ кэшируем
// между звонками, запрашиваем заново перед каждым startCall/acceptCall.
export async function getIceServers(){
  let turnServers = await requestExtDisco();
  if(turnServers.length === 0) turnServers = deriveTurnFromDomain();
  return STUN_FALLBACK.concat(turnServers);
}
