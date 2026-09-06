// ===================== net/mam/rsm-query.js =====================
// Чистый XMPP-транспорт одной страницы MAM-архива (XEP-0313 + RSM XEP-0059).
// Ничего не знает про state/приложение - принимает connection параметром,
// поэтому легко переиспользуется и тестируется отдельно от домена.
import { IQ_TIMEOUT_MS } from '../../core/constants.js';

const NS_MAM = 'urn:xmpp:mam:2';
const NS_RSM = 'http://jabber.org/protocol/rsm';

// Запрашивает одну страницу архива. withJid - ограничить одним собеседником
// (не используется при полной синхронизации аккаунта). Возвращает
// {items:[{id, inner, stamp}], first, last, complete}.
export function queryMamPage(connection, { withJid, after, before, max } = {}){
  return new Promise((resolve, reject) => {
    const queryId = 'mam' + Math.random().toString(36).slice(2);
    const items = [];

    const onStanza = (stanza) => {
      const result = stanza.querySelector('result');
      if(!result || result.getAttribute('queryid') !== queryId) return true;
      const forwarded = result.querySelector('forwarded');
      const inner = forwarded && forwarded.querySelector('message');
      if(!inner) return true;
      const delay = forwarded.querySelector('delay');
      items.push({ id: result.getAttribute('id'), inner, stamp: delay ? delay.getAttribute('stamp') : null });
      return true;
    };
    const handlerRef = connection.addHandler(onStanza, null, 'message', null, null, null);

    let q = $iq({type:'set'}).c('query', {xmlns: NS_MAM, queryid: queryId})
      .c('x', {xmlns:'jabber:x:data', type:'submit'})
        .c('field', {var:'FORM_TYPE', type:'hidden'}).c('value').t(NS_MAM).up().up();
    if(withJid){
      q = q.c('field', {var:'with'}).c('value').t(withJid).up().up();
    }
    q = q.up(); // назад из <x> в <query>
    q = q.c('set', {xmlns: NS_RSM});
    const maxValue = max ?? null;
    if(maxValue !== null) q = q.c('max').t(String(maxValue)).up();
    if(after) q = q.c('after').t(after).up();
    if(before !== undefined) q = q.c('before').t(before || '').up();

    connection.sendIQ(q, (iqRes) => {
      connection.deleteHandler(handlerRef);
      const fin = iqRes.querySelector('fin');
      const rsmSet = fin ? fin.querySelector('set') : null;
      const firstEl = rsmSet ? rsmSet.querySelector('first') : null;
      const lastEl = rsmSet ? rsmSet.querySelector('last') : null;
      resolve({
        items,
        first: firstEl ? Strophe.getText(firstEl) : null,
        last: lastEl ? Strophe.getText(lastEl) : null,
        complete: fin ? fin.getAttribute('complete') === 'true' : true,
      });
    }, (err) => {
      connection.deleteHandler(handlerRef);
      reject(err || new Error('MAM IQ error'));
    }, IQ_TIMEOUT_MS);
  });
}
