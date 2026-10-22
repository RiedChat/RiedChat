// ===================== net/presence/caps.js =====================
// XEP-0115 Entity Capabilities: наши disco#info фичи, caps ver, сборка и отправка исходящего presence.
// Из net/presence.js.
import { CAPS_NODE, NS_CAPS, NS_DISCO_INFO, NS_NICK, NS_OMEMO_DEVICES, NS_VCARD_UPDATE } from '../../core/constants.js';
import { debugLog, errMsg } from '../../core/debug-log.js';
import { state } from '../../core/state.js';
import * as bytes from '../../crypto/bytes.js';
import { profileStore } from '../vcard-storage.js';

// Наши disco#info фичи. '+notify' на device-list узле заставляет сервер контакта (увидев наш caps hash)
// авто-подписать нас на этот узел (XEP-0163, Business Rules for Publish and Notify Nodes), а наш
// сервер - на device-list контактов с тем же анонсом. Без него push об изменении device-list не приходит.
const CAPS_IDENTITY = { category: 'client', type: 'web', name: 'omemo-web-chat' };
const CAPS_FEATURES = [
  NS_DISCO_INFO,
  NS_CAPS,
  NS_OMEMO_DEVICES + '+notify',
];

// XEP-0115 §5.1: конкатенация identity- и feature-строк через '<', SHA-1, base64.
// Одна identity и фиксированные фичи без расширений (dataforms) - полный алгоритм не нужен.
async function computeCapsVer(){
  const idStr = `${CAPS_IDENTITY.category}/${CAPS_IDENTITY.type}//${CAPS_IDENTITY.name}<`;
  const featStr = CAPS_FEATURES.slice().sort().join('<') + '<';
  const s = idStr + featStr;
  const digest = await crypto.subtle.digest('SHA-1', bytes.utf8ToBuf(s));
  return bytes.b64FromBuf(digest);
}

// Собирает и отправляет presence для контактов: XEP-0115 caps hash (если посчитан), XEP-0172 <nick/>
// (из профиля, net/vcard.js) и XEP-0153 vcard-update - SHA-1 текущего аватара (пустой <photo/>, если
// аватара нет): по нему контакты решают, перекачивать ли нашу vCard.
// Вызывается при входе и после сохранения профиля (net/vcard.js:applyProfile).
export async function broadcastPresence(){
  const profile = profileStore.get();
  const pres = $pres();
  try{
    const ver = await computeCapsVer();
    pres.c('c', {xmlns: NS_CAPS, hash: 'sha-1', node: CAPS_NODE, ver}).up();
    debugLog('presence: caps ver=' + ver + ' (фичи: ' + CAPS_FEATURES.join(', ') + ')');
  }catch(e){
    debugLog('presence: не удалось вычислить caps ver (' + errMsg(e) + ') - отправляю без caps');
  }
  if(profile?.nickname){
    pres.c('nick', {xmlns: NS_NICK}).t(profile.nickname).up();
  }
  if(profile){
    pres.c('x', {xmlns: NS_VCARD_UPDATE}).c('photo').t(profile.photoHash || '').up().up();
  }
  state.connection.send(pres);
}

export function onDiscoInfoIq(iq){
  const id = iq.getAttribute('id');
  const from = iq.getAttribute('from');
  const res = $iq({type:'result', id, to: from}).c('query', {xmlns: NS_DISCO_INFO});
  res.c('identity', CAPS_IDENTITY).up();
  CAPS_FEATURES.forEach(f => res.c('feature', {var: f}).up());
  state.connection.send(res);
  return true;
}
