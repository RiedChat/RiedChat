// ===================== net/presence/caps.js =====================
// XEP-0115 Entity Capabilities: наши disco#info фичи, вычисление caps ver
// и сборка/отправка исходящего presence. Выделено из net/presence.js.
import { CAPS_NODE, NS_CAPS, NS_DISCO_INFO, NS_NICK, NS_OMEMO_DEVICES, NS_VCARD_UPDATE } from '../../core/constants.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { loadProfile } from '../vcard-storage.js';

const S = state;

// Наши disco#info фичи. '+notify' на device-list узле - это то, что заставляет
// СЕРВЕР КОНТАКТА (когда он видит наш caps hash в presence) авто-подписать нас
// на события этого узла по правилам XEP-0163 §"Business Rules for Publish and
// Notify Nodes" - а также то, что позволяет НАШЕМУ серверу авто-подписать нас
// на device-list контактов, если они анонсируют то же самое. Без этой строки
// push-уведомления об изменении device-list никогда не приходят, и клиент
// вынужден полагаться на ручной опрос PEP перед каждой отправкой.
const CAPS_IDENTITY = { category: 'client', type: 'web', name: 'omemo-web-chat' };
export const CAPS_FEATURES = [
  NS_DISCO_INFO,
  NS_CAPS,
  NS_OMEMO_DEVICES + '+notify',
];

// XEP-0115 §5.1: конкатенация identity- и feature-строк через '<', SHA-1, base64.
// У нас всегда ровно одна identity и фиксированный список фич без расширений
// (dataforms), поэтому полный алгоритм с генерализованными расширениями не нужен.
async function computeCapsVer(){
  const idStr = `${CAPS_IDENTITY.category}/${CAPS_IDENTITY.type}//${CAPS_IDENTITY.name}<`;
  const featStr = CAPS_FEATURES.slice().sort().join('<') + '<';
  const s = idStr + featStr;
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

// Собирает и отправляет presence со всем, что должны видеть контакты: XEP-0115
// caps hash (если удалось посчитать), XEP-0172 <nick/> (псевдоним из своего
// профиля, см. net/vcard.js) и XEP-0153 vcard-update - SHA-1 хэш текущего
// аватара (пустой <photo/>, если аватар не выставлен), по которому контакты
// понимают, нужно ли перекачивать нашу vCard. Вызывается и при входе, и
// сразу после сохранения профиля (net/vcard.js:applyProfile), чтобы
// изменения психевдонима/аватара сразу разошлись всем, кто нас видит онлайн.
export async function broadcastPresence(){
  const profile = loadProfile();
  const pres = $pres();
  try{
    const ver = await computeCapsVer();
    pres.c('c', {xmlns: NS_CAPS, hash: 'sha-1', node: CAPS_NODE, ver}).up();
    debugLog('presence: caps ver=' + ver + ' (фичи: ' + CAPS_FEATURES.join(', ') + ')');
  }catch(e){
    debugLog('presence: не удалось вычислить caps ver (' + (e && e.message ? e.message : e) + ') - отправляю без caps');
  }
  if(profile && profile.nickname){
    pres.c('nick', {xmlns: NS_NICK}).t(profile.nickname).up();
  }
  if(profile){
    pres.c('x', {xmlns: NS_VCARD_UPDATE}).c('photo').t(profile.photoHash || '').up().up();
  }
  S.connection.send(pres);
}

// CAPS_FEATURES/broadcastPresence потребляются только через прямой import
// (net/presence/disco.js, net/connection/bootstrap.js, net/vcard.js) -
// window.App-мост здесь больше не нужен.
