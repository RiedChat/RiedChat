// ===================== net/upload/transport.js =====================
// PUT файла в slot из net/upload/slot.js: XHR с прогрессом, обработка сети/таймаута. Про OMEMO и очередь не знает.
import { debugLog } from '../../core/debug-log.js';
import { toast } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';
import * as uploadProgress from '../../ui/upload-progress.js';

// Текущий xhr (загрузки строго по очереди, net/upload.js:_uploadChain) - чтобы cancelUpload() прервал его по клику на прогресс-бар.
let _activeXhr = null;

// Резолвится с {ok} по завершении (в т.ч. ошибка/отмена): для очереди fire-and-forget, ошибку показываем тостом здесь.
export function putFile({putUrl, headers, blob, putHost}){
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      _activeXhr = xhr;
      // Единый финал: сбросить xhr, спрятать бар, показать тост (если есть), зарезолвить put().
      const finish = (ok, toastText) => {
        _activeXhr = null;
        uploadProgress.hide();
        if(toastText) toast(toastText);
        resolve({ok});
      };
      xhr.open('PUT', putUrl);
      xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
      headers.forEach(h => {
        // Невалидный/дублирующийся заголовок из slot-ответа не рвёт аплоад - пропускаем, остальные ставим.
        try{ xhr.setRequestHeader(h.getAttribute('name'), Strophe.getText(h)); }catch{}
      });
      xhr.upload.addEventListener('progress', (ev) => {
        if(ev.lengthComputable){
          uploadProgress.setPct(Math.round((ev.loaded/ev.total)*100));
        }
      });
      xhr.onload = () => {
        debugLog('[upload] ответ сервера: HTTP ' + xhr.status + ' ' + xhr.statusText + ' | headers: ' + xhr.getAllResponseHeaders().replace(/\r?\n/g, ' | '));
        if(xhr.status >= 200 && xhr.status < 300){
          finish(true);
        } else {
          finish(false, t('upload.httpError', {status: xhr.status}) + (xhr.status===413 ? t('upload.tooLargeSuffix') : ''));
        }
      };
      xhr.onerror = () => {
        debugLog('[upload] xhr.onerror - запрос не дошёл до сервера или заблокирован браузером. readyState=' + xhr.readyState + ' status=' + xhr.status + ' putUrl=' + putUrl);
        debugLog('[upload] Частые причины: 1) CORS - на upload-хосте (' + (putHost || '?') + ') нет Access-Control-Allow-Origin для PUT; '
          + '2) невалидный/самоподписанный TLS-сертификат на upload-хосте; '
          + '3) upload-хост недоступен из браузера (DNS/файрвол), хотя доступен серверу XMPP.');
        finish(false, t('upload.networkError'));
      };
      xhr.onabort = () => {
        debugLog('[upload] загрузка отменена пользователем: ' + putUrl);
        finish(false, t('upload.cancelled'));
      };
      xhr.send(blob);
    });
}

export const cancelUpload = () => _activeXhr?.abort();
