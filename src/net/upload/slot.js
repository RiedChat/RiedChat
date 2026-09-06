// ===================== net/upload/slot.js =====================
// XEP-0363 (HTTP File Upload): поиск upload-компонента через disco#items и
// запрос слота (put/get URL) под конкретный файл. Ничего не знает про
// шифрование (net/upload/encrypt.js) и про сам PUT (net/upload/transport.js).
import { IQ_TIMEOUT_MS, NS_HTTPUPLOAD } from '../../core/constants.js';
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

const S = state;

// Добавляет хост в allowlist доверенных upload-хостов (S.trustedUploadHosts),
// не создавая дубликатов. См. комментарий у trustedUploadHosts в core/state.js.
function trustHost(host){
  if(host && !S.trustedUploadHosts.includes(host)) S.trustedUploadHosts.push(host);
}

export function discoverUploadComponent(){
  const iq = $iq({type:'get', to: Strophe.getDomainFromJid(S.myJid)})
    .c('query', {xmlns:'http://jabber.org/protocol/disco#items'});
  S.connection.sendIQ(iq, (res) => {
    const items = res.querySelectorAll('item');
    let found = null;
    items.forEach(it => { if(!found) found = it.getAttribute('jid'); });
    items.forEach(it => { if(it.getAttribute('jid').includes('upload')) found = it.getAttribute('jid'); });
    if(found){
      S.uploadComponentJid = found;
      // Домен upload-компонента (например, "upload.example.com") в большинстве
      // серверов совпадает с хостом реальных get/put-URL из слота - доверяем
      // ему сразу, ещё до первой собственной загрузки файла.
      trustHost(found);
    }
  }, () => {}, IQ_TIMEOUT_MS);
}

export const uploadSlot = {
  // Запрашивает slot и возвращает {putUrl, getUrl, headers}. Отклоняется со
  // {reason} - понятной строкой для toast - если сервер не выдал слот,
  // вернул ошибку или не ответил вовремя (см. подробный комментарий про
  // необходимость явного таймаута sendIQ в crypto/omemo/device-list-discovery.js).
  requestSlot({filename, declaredSize, contentType}){
    return new Promise((resolve, reject) => {
      const iq = $iq({type:'get', to: S.uploadComponentJid, id:'upload1'})
        .c('request', {xmlns: NS_HTTPUPLOAD, filename, size: String(declaredSize), 'content-type': contentType});

      S.connection.sendIQ(iq, (res) => {
        const slot = res.querySelector('slot');
        if(!slot){ reject({reason: t('upload.slotRejected')}); return; }
        const put = slot.querySelector('put');
        const get = slot.querySelector('get');
        const putUrl = put.getAttribute('url');
        const getUrl = get.getAttribute('url');
        const headers = put.querySelectorAll('header');

        debugLog('[upload] slot получен: putUrl=' + putUrl + ' getUrl=' + getUrl + ' pageOrigin=' + location.origin + ' declaredSize=' + declaredSize);

        // Проверка на mixed content: страница https, а putUrl http
        if(location.protocol === 'https:' && putUrl.startsWith('http://')){
          debugLog('[upload] MIXED CONTENT: страница по HTTPS, а putUrl по HTTP - браузер заблокирует такой запрос.');
          reject({reason: t('upload.mixedContent')});
          return;
        }

        let putHost;
        try{ putHost = new URL(putUrl).host; }catch(e){ putHost = null; }
        if(putHost && putHost !== location.host){
          debugLog('[upload] upload-хост (' + putHost + ') отличается от хоста страницы (' + location.host + ') - если PUT не пройдёт, проверьте CORS и TLS-сертификат на этом хосте.');
        }

        // Сервер сам сказал нам, куда класть/забирать наши файлы - значит, этому
        // хосту можно доверять и при скачивании чужих aesgcm://-вложений
        // (см. net/media-worker/fetch-decrypt.js и trustedUploadHosts).
        trustHost(putHost);
        // getUrl может отличаться от putUrl (CDN-раздача) - если он вдруг
        // невалиден как URL, просто не добавляем его хост в доверенные;
        // putHost уже доверен строкой выше, аплоад это не блокирует.
        try{ trustHost(new URL(getUrl).host); }catch(e){}

        resolve({putUrl, getUrl, headers, putHost});
      }, (err) => {
        const errEl = err && err.querySelector && err.querySelector('error text');
        reject({reason: t('upload.slotNotIssued', {detail: errEl ? Strophe.getText(errEl) : (err ? t('upload.slotLimitReached') : t('upload.slotNoResponse'))})});
      }, IQ_TIMEOUT_MS);
    });
  },
};

// discoverUploadComponent потребляется только из net/connection/bootstrap.js,
// который теперь импортирует его напрямую; uploadSlot - только из
// net/upload.js (тоже прямой import) - window.App-мост здесь не нужен.
