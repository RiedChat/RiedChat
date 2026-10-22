// ===================== net/presence/incoming.js =====================
// Входящий <presence/>: подписки, XEP-0172 nick, XEP-0153 vcard-update, онлайн/офлайн по ресурсам.
// Из net/presence.js. Разбор - parse.js, применение к state - apply.js, подписки - subscribe-queue.js;
// onPresence - диспетчер по type.
import { debugLog } from '../../core/debug-log.js';
import { nickOf, debounce } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { renderChatHead } from '../../ui/chat-head.js';
import { renderRoster } from '../../ui/roster.js';

import { applyNick, applyVcardHash, applyResourceUpdate } from './apply.js';
import { parseNick, parseVcardHash } from './parse.js';
import { queueSubscriptionApproval } from './subscribe-queue.js';

// При реконнекте сервер шлёт presence по всему ростеру пачкой за миллисекунды - без debounce renderRoster()
// перерисовывал бы список на каждую. 150 мс схлопывают пачку и не заметны для одиночных событий.
const scheduleRenderRoster = debounce(renderRoster, 150);

export function onPresence(stanza){
  const from = stanza.getAttribute('from');
  const bare = Strophe.getBareJidFromJid(from);
  const type = stanza.getAttribute('type');
  const resource = Strophe.getResourceFromJid(from);
  if(bare === state.myBareJid) return true;
  state.roster[bare] ??= {name: nickOf(bare)};

  // type бывает subscribe/subscribed/unsubscribe/unsubscribed/error - ни один не означает "в сети".
  if(type === 'subscribe'){
    // Подписку не подтверждаем автоматически - спрашиваем пользователя (queueSubscriptionApproval,
    // subscribe-queue.js). Встречный 'subscribe' не шлём: он уже отправлен через addContact()
    // или уйдёт при следующем fetchRoster().
    queueSubscriptionApproval(bare);
    return true;  // не сигнал online/offline - статус не меняем
  }
  if(type === 'subscribed' || type === 'unsubscribe' || type === 'unsubscribed'){
    debugLog('presence: ' + type + ' от ' + bare + ' - не влияет на статус online/offline');
    return true;
  }
  if(type === 'error'){
    debugLog('presence: ошибка от ' + bare);
    return true;
  }

  applyNick(bare, parseNick(stanza));

  const vcardHash = parseVcardHash(stanza);
  if(vcardHash !== null) applyVcardHash(bare, vcardHash);

  applyResourceUpdate(bare, resource, type);

  scheduleRenderRoster();
  // Шапка активного чата - точечное обновление одного элемента, debounce не нужен.
  if(state.activeChat === bare) renderChatHead();
  return true;
}
