// ============= ui/chat-view/media-loader/defer-until-tap.js =============
import { setHTML } from '../../../core/safe-html.js';
import { history } from '../../../net/history.js';
import { media } from '../../../net/media.js';
import { TAP_LOAD_CLASS, imageLinkHtml } from '../media-placeholder.js';

// «Нажмите, чтобы загрузить»: одноразовый клик по плейсхолдеру (host) запускает start. Если файл уже в постоянном кэше (cachedUrl, history.hasMediaEntry) - грузим сразу.
export function deferUntilTap(host, { holdOff = true, start = () => {}, onTap, cachedUrl }){
  if(!holdOff){ start(); return; }
  let started = false;
  const go = () => {
    if(started) return;
    started = true;
    host.classList.remove(TAP_LOAD_CLASS);
    if(onTap) onTap(host);
    start();
  };
  host.addEventListener('click', go, {once: true});
  if(cachedUrl){
    history.hasMediaEntry(cachedUrl).then(has => { if(has) go(); }).catch(() => {});
  }
}

// Расшифровывает aesgcm://. Возвращает entry; null, если host убран из DOM (сообщение перерисовано/удалено), пока шла загрузка.
export async function decryptInto(host, aesgcmUrl, onProgress, senderJid){
  const entry = await media.decrypt(aesgcmUrl, onProgress, senderJid);
  return host.isConnected ? entry : null;
}

// Обычная https-картинка с заглушкой: по клику подменяем плейсхолдер на <img>. Без decrypt() и постоянного кэша - файл лежит открытым на хосте.
export function loadPlainImage(host, url){
  deferUntilTap(host, {
    onTap: () => setHTML(host, imageLinkHtml(url)),
  });
}
