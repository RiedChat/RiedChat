// ===================== net/presence/incoming.js =====================
// Обработка входящего <presence/>: подписки, XEP-0172 nick, XEP-0153
// vcard-update, онлайн/офлайн по ресурсам. Выделено из net/presence.js.
// Разбор станзы и применение к state вынесены в отдельные модули
// (parse.js, apply.js, subscribe-queue.js) - onPresence остаётся тонким
// диспетчером по type.
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { renderRoster } from '../../ui/roster.js';
import { renderChatHead } from '../../ui/chat-head.js';
import { queueSubscriptionApproval } from './subscribe-queue.js';
import { parseNick, parseVcardHash } from './parse.js';
import { applyNick, applyVcardHash, applyResourceUpdate } from './apply.js';
import { debounce } from '../../core/timing.js';

const S = state;

// При реконнекте сервер шлёт presence по всему ростеру пачкой (десятки
// стэнз за миллисекунды) - без debounce renderRoster() перерисовывала бы
// весь список на каждую отдельную стэнзу. 150мс достаточно, чтобы схлопнуть
// пачку в одну перерисовку, и не заметно на глаз как задержка для одиночных
// online/offline вне пачки.
const scheduleRenderRoster = debounce(renderRoster, 150);

export function onPresence(stanza){
  const from = stanza.getAttribute('from');
  const bare = Strophe.getBareJidFromJid(from);
  const resource = Strophe.getResourceFromJid(from);
  const type = stanza.getAttribute('type');
  if(bare === S.myBareJid) return true;
  S.roster[bare] = S.roster[bare] || {name: bare.split('@')[0]};

  // ВАЖНО: presence бывает не только "online/offline" - type может быть
  // subscribe/subscribed/unsubscribe/unsubscribed/error, и ни один из
  // них не означает "собеседник в сети".
  if(type === 'subscribe'){
    // Больше не подтверждаем автоматически - спрашиваем пользователя (см.
    // queueSubscriptionApproval в subscribe-queue.js). Встречный 'subscribe'
    // в обратную сторону отсюда тоже не шлём: он либо уже отправлен явно
    // через addContact(), либо будет отправлен при следующем fetchRoster().
    queueSubscriptionApproval(bare);
    return true; // это не сигнал online/offline - на статус не влияет
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
  // Шапка активного чата - точечное обновление, не бьёт по всему списку,
  // debounce тут не нужен: перерисовывается один-единственный элемент.
  if(S.activeChat === bare) renderChatHead();
  return true;
}

// onPresence потребляется только из net/connection/bootstrap.js (прямой
// import) - window.App-мост здесь больше не нужен.
