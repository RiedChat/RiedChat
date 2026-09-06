import { toast } from '../../core/dom-utils.js';
import { t } from '../../i18n/t.js';

// ---------- действие: свайп слева направо -> копировать текст / скачать медиа ----------
export async function swipeAction(msg, bubble){
  const kind = bubble.dataset.kind;
  if(kind && kind !== 'text'){
    const url = bubble.dataset.downloadUrl;
    if(!url){
      toast(t('copyDownload.fileLoading'));
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = bubble.dataset.downloadName || '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(t('copyDownload.downloadStarted'));
    return;
  }

  const text = msg.body || '';
  try{
    await navigator.clipboard.writeText(text);
    toast(t('copyDownload.textCopied'));
  }catch(e){
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast(t('copyDownload.textCopied'));
    }catch(e2){
      toast(t('copyDownload.copyFailed'));
    }
  }
}
