// ===================== net/presence/disco.js =====================
// Ответ на disco#info запрос списком наших фич (см. net/presence/caps.js).
// Выделено из net/presence.js.
import { NS_DISCO_INFO } from '../../core/constants.js';
import { state } from '../../core/state.js';
import { CAPS_FEATURES } from './caps.js';

const S = state;

// Отвечает на disco#info запрос (к нашему bare или полному JID) списком фич,
// включающим omemo:2:devices+notify - без этого запрашивающая сторона не может
// подтвердить наш caps-hash из presence и, по правилам XEP-0115, не будет
// доверять ему (и, соответственно, PEP auto-subscribe на нашей стороне тоже
// зависит от того, что мы сами умеем ответить на такой же запрос от своего сервера).
export function onDiscoInfoIq(iq){
  const id = iq.getAttribute('id');
  const from = iq.getAttribute('from');
  const res = $iq({type:'result', id, to: from}).c('query', {xmlns: NS_DISCO_INFO});
  res.c('identity', {category:'client', type:'web', name:'omemo-web-chat'}).up();
  CAPS_FEATURES.forEach(f => res.c('feature', {var: f}).up());
  S.connection.send(res);
  return true;
}

// onDiscoInfoIq потребляется только из net/connection/bootstrap.js (прямой
// import) - window.App-мост здесь больше не нужен.
