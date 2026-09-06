// ===================== net/messaging/outgoing/fallback-notify.js =====================
// Показывает пользователю toast, если sendMessage()/editMessage() пришлось
// отправить сообщение без OMEMO-шифрования, хотя оно должно было быть
// зашифровано. Вынесено отдельно, т.к. это побочный эффект показа UI, а не
// часть транспортной логики - send.js/edit.js должны возвращать статус, а не
// сами решать, что показать пользователю (см. вызовы из net/upload.js).
import { toast } from '../../../core/dom-utils.js';
import { t } from '../../../i18n/t.js';

export function notifyEncryptionFallback(fallbackReason){
  if(fallbackReason === 'all-devices-dead'){
    toast(t('messaging.fallbackNoSession'));
  } else if(fallbackReason === 'no-devices'){
    toast(t('messaging.fallbackNoDevices'));
  }
}
