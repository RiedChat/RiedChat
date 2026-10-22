// ===================== net/messaging/outgoing/stanza-body.js =====================
// Дописывает в <message> (Strophe builder) зашифрованный OMEMO-элемент + плейсхолдер-<body>
// и <markable/> (XEP-0333). Общая часть sendMessage и editMessage.
import { NS_CHAT_MARKERS, NS_HINTS } from '../../../core/constants.js';
import { t } from '../../../i18n/t.js';

export function appendStanzaBody(msg, encryptedEl){
  msg.cnode(encryptedEl).up();
  // текст-заглушка для клиентов без OMEMO + просьба не хранить на сервере открытым
  msg.c('body').t(t('messaging.omemoPlaceholder')).up();
  msg.c('store', {xmlns: NS_HINTS}).up();
  // Просим подтвердить прочтение (XEP-0333); маркер - открытые метаданные, текст не раскрывает.
  msg.c('markable', {xmlns: NS_CHAT_MARKERS}).up();
}
