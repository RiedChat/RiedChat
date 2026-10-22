// ===================== net/upload/slot.js =====================
// XEP-0363 (HTTP File Upload): поиск upload-компонента (disco#items) и запрос слота (put/get URL) под файл.
// Про шифрование (encrypt.js) и PUT (transport.js) не знает.
import { NS_HTTPUPLOAD } from '../../core/constants.js';
import { debugLog } from '../../core/debug-log.js';
import { sendIqAsync, sendIqSafe } from '../../core/iq.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';

// Добавляет хост в allowlist доверенных upload-хостов (state.trustedUploadHosts) без дубликатов (см. core/state.js).
function trustHost(host){
  if(host && !state.trustedUploadHosts.includes(host)) state.trustedUploadHosts.push(host);
}

export async function discoverUploadComponent(){
  const iq = $iq({type:'get', to: Strophe.getDomainFromJid(state.myJid)})
    .c('query', {xmlns:'http://jabber.org/protocol/disco#items'});
  const res = await sendIqSafe(iq);
  if(!res) return;
  const jids = [...res.querySelectorAll('item')].map(it => it.getAttribute('jid'));
  const found = jids.filter(j => j.includes('upload')).pop() ?? jids[0];
  if(found){
    state.uploadComponentJid = found;
    // Домен upload-компонента (напр. "upload.example.com") обычно совпадает с хостом get/put-URL -
    // доверяем сразу, до первой загрузки.
    trustHost(found);
  }
}

const hostOf = (url) => URL.canParse(url) ? new URL(url).host : null;

// Запрашивает слот, возвращает {putUrl, getUrl, headers}. Отклоняется с {reason} (строка для тоста):
// сервер не выдал слот, вернул ошибку или не ответил вовремя (core/iq.js).
export async function requestSlot({filename, declaredSize, contentType}){
  const iq = $iq({type:'get', to: state.uploadComponentJid, id:'upload1'})
    .c('request', {xmlns: NS_HTTPUPLOAD, filename, size: String(declaredSize), 'content-type': contentType});

  let res;
  try{
    res = await sendIqAsync(iq);
  }catch(err){
    const errEl = err?.querySelector?.('error text');
    throw {reason: t('upload.slotNotIssued', {detail: errEl ? Strophe.getText(errEl) : (err ? t('upload.slotLimitReached') : t('upload.slotNoResponse'))})};
  }

  const slot = res.querySelector('slot');
  if(!slot) throw {reason: t('upload.slotRejected')};
  const put = slot.querySelector('put');
  const get = slot.querySelector('get');
  const putUrl = put.getAttribute('url');
  const getUrl = get.getAttribute('url');
  const headers = put.querySelectorAll('header');

  debugLog('[upload] slot получен: putUrl=' + putUrl + ' getUrl=' + getUrl + ' pageOrigin=' + location.origin + ' declaredSize=' + declaredSize);

  // mixed content: страница https, putUrl http
  if(location.protocol === 'https:' && putUrl.startsWith('http://')){
    debugLog('[upload] MIXED CONTENT: страница по HTTPS, а putUrl по HTTP - браузер заблокирует такой запрос.');
    throw {reason: t('upload.mixedContent')};
  }

  const putHost = hostOf(putUrl);
  if(putHost && putHost !== location.host){
    debugLog('[upload] upload-хост (' + putHost + ') отличается от хоста страницы (' + location.host + ') - если PUT не пройдёт, проверьте CORS и TLS-сертификат на этом хосте.');
  }

  // Сервер сам указал, куда класть/забирать файлы - хосту можно доверять и при скачивании чужих
  // aesgcm://-вложений (net/media-worker/fetch-decrypt.js, trustedUploadHosts).
  trustHost(putHost);
  // getUrl может отличаться от putUrl (CDN); если невалиден как URL - хост не добавляем,
  // putHost уже доверен выше, аплоад не блокируется.
  trustHost(hostOf(getUrl));

  return {putUrl, getUrl, headers, putHost};
}
