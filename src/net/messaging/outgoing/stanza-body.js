// ===================== net/messaging/outgoing/stanza-body.js =====================
// Дописывает в уже созданную <message> станзу (Strophe builder) либо
// зашифрованный OMEMO-элемент + плейсхолдер-<body>, либо открытый <body>, и
// в обоих случаях <markable/> (XEP-0333) - общая часть для sendMessage и
// editMessage (различается только сам билдер станзы и её остальные атрибуты).
import { NS_CHAT_MARKERS, NS_HINTS } from '../../../core/constants.js';
import { t } from '../../../i18n/t.js';

// Возвращает encrypted:boolean - для локальной записи сообщения в историю.
export function appendStanzaBody(msg, encryptedEl, plainBody){
  let encrypted = false;
  if(encryptedEl){
    msg.cnode(encryptedEl).up();
    // осмысленный текст-заглушка для клиентов без OMEMO + подсказка не хранить на сервере в открытую
    msg.c('body').t(t('messaging.omemoPlaceholder')).up();
    msg.c('store', {xmlns: NS_HINTS}).up();
    encrypted = true;
  } else {
    msg.c('body').t(plainBody).up();
  }
  // Просим собеседника подтвердить прочтение (XEP-0333) - сам текст сообщения
  // это не расшифровывает и не раскрывает, маркер идёт открытым метаданными.
  msg.c('markable', {xmlns: NS_CHAT_MARKERS}).up();
  return encrypted;
}
