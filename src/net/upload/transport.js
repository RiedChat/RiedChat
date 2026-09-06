// ===================== net/upload/transport.js =====================
// Сам PUT файла в slot, полученный от net/upload/slot.js: XHR с прогрессом
// и обработкой сети/таймаута. Не знает ни про OMEMO, ни про очередь.
import { $, toast } from '../../core/dom-utils.js';
import { debugLog } from '../../core/debug-log.js';
import { t } from '../../i18n/t.js';

// Текущий активный xhr (один - загрузки идут строго по очереди, см.
// net/upload.js:_uploadChain), чтобы cancelCurrent() мог его прервать
// по клику на прогресс-бар.
let _activeXhr = null;

export const uploadTransport = {
  // Резолвится с {status, ok} по завершении (в т.ч. при ошибке/таймауте -
  // это fire-and-forget с точки зрения очереди загрузок, ошибку показываем
  // через toast здесь же).
  put({putUrl, headers, blob, putHost}){
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      _activeXhr = xhr;
      xhr.open('PUT', putUrl);
      xhr.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
      headers.forEach(h => {
        // Один невалидный/дублирующийся заголовок из slot-ответа сервера не
        // должен рвать весь аплоад - пропускаем его и ставим остальные.
        try{ xhr.setRequestHeader(h.getAttribute('name'), Strophe.getText(h)); }catch(err){}
      });
      xhr.upload.addEventListener('progress', (ev) => {
        if(ev.lengthComputable){
          const pct = Math.round((ev.loaded/ev.total)*100);
          $('upload-bar-fill').style.width = pct + '%';
          $('upload-pct').textContent = pct + '%';
        }
      });
      xhr.onload = () => {
        _activeXhr = null;
        $('upload-progress').style.display = 'none';
        debugLog('[upload] ответ сервера: HTTP ' + xhr.status + ' ' + xhr.statusText + ' | headers: ' + xhr.getAllResponseHeaders().replace(/\r?\n/g, ' | '));
        if(xhr.status >= 200 && xhr.status < 300){
          resolve({ok: true});
        } else {
          toast(t('upload.httpError', {status: xhr.status}) + (xhr.status===413 ? t('upload.tooLargeSuffix') : ''));
          resolve({ok: false});
        }
      };
      xhr.onerror = () => {
        _activeXhr = null;
        $('upload-progress').style.display = 'none';
        debugLog('[upload] xhr.onerror - запрос не дошёл до сервера или заблокирован браузером. readyState=' + xhr.readyState + ' status=' + xhr.status + ' putUrl=' + putUrl);
        debugLog('[upload] Частые причины: 1) CORS - на upload-хосте (' + (putHost || '?') + ') нет Access-Control-Allow-Origin для PUT; '
          + '2) невалидный/самоподписанный TLS-сертификат на upload-хосте; '
          + '3) upload-хост недоступен из браузера (DNS/файрвол), хотя доступен серверу XMPP.');
        toast(t('upload.networkError'));
        resolve({ok: false});
      };
      xhr.ontimeout = () => {
        _activeXhr = null;
        $('upload-progress').style.display = 'none';
        debugLog('[upload] таймаут запроса к ' + putUrl);
        toast(t('upload.timeoutError'));
        resolve({ok: false});
      };
      xhr.onabort = () => {
        _activeXhr = null;
        $('upload-progress').style.display = 'none';
        debugLog('[upload] загрузка отменена пользователем: ' + putUrl);
        toast(t('upload.cancelled'));
        resolve({ok: false});
      };
      xhr.send(blob);
    });
  },

  // Отменяет текущую загрузку (клик по прогресс-бару). onabort сам скроет
  // #upload-progress и зарезолвит put(...) - очередь (net/upload.js)
  // просто перейдёт к следующему файлу, как при обычной ошибке.
  cancelCurrent(){
    if(_activeXhr){
      _activeXhr.abort();
    }
  },
};

// uploadTransport потребляется только из net/upload.js (прямой import) -
// window.App-мост здесь больше не нужен.
