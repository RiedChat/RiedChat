// ===================== net/messaging/outgoing/encrypt-required.js =====================
// Общая для sendMessage, editMessage и загрузки файлов проверка: исходящее уходит только зашифрованным OMEMO.
// Не удалось зашифровать - возвращаем encryptedEl:null и показываем тост; вызывающий ничего не отправляет.
import { toast } from '../../../core/dom-utils.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { t } from '../../../i18n/t.js';

const NOT_SENT_TOAST = {
  'omemo-unavailable': 'messaging.notSentUnavailable',
  'all-devices-dead': 'messaging.notSentNoSession',
  'no-devices': 'messaging.notSentNoDevices',
};

export function notifyNotSent(reason){
  toast(t(NOT_SENT_TOAST[reason] || NOT_SENT_TOAST['no-devices']));
}

// Возвращает {encryptedEl, reason}: reason не null только при encryptedEl:null -
// 'omemo-unavailable' | 'all-devices-dead' | 'no-devices'.
export async function encryptRequired(toJid, body){
  if(!omemo.ready){
    notifyNotSent('omemo-unavailable');
    return { encryptedEl:null, reason:'omemo-unavailable' };
  }
  try{
    const encryptedEl = await omemo.encryptFor(toJid, body);
    if(encryptedEl) return { encryptedEl, reason:null };
  }catch(e){ console.warn('OMEMO encrypt failed', e); }
  const reason = omemo.encryptFailReason();
  notifyNotSent(reason);
  return { encryptedEl:null, reason };
}
