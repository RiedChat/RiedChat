// =============== net/presence/subscribe-queue.js ===============
// Очередь подтверждения входящих presence-подписок пользователем.
// Выделено из net/presence/incoming.js.
//
// Раньше onPresence молча слал 'subscribed' в ответ на любой 'subscribe' -
// это раскрывает online/offline-статус, lastSeen, ник и аватар кому угодно
// на домене без согласия пользователя (riedchat-security-plan.md, п.7).
// Встречный 'subscribe' теперь НЕ отправляется отсюда автоматически - он
// либо уже был отправлен явно через addContact() (net/roster.js), либо
// подтянется через fetchRoster() при следующей синхронизации ростера.
import { state } from '../../core/state.js';
import { debugLog } from '../../core/debug-log.js';
import { confirm } from '../../ui/modals.js';
import { t } from '../../i18n/t.js';

const S = state;

const pendingSubscribeRequests = new Set(); // JID, уже ждущие показа/находящиеся в модалке - не даём задвоиться
const subscribeQueue = [];
let subscribeModalActive = false;

export function queueSubscriptionApproval(bare){
  if(pendingSubscribeRequests.has(bare)) return; // повторный subscribe-стос от того же JID пока ждём ответа - игнорируем
  pendingSubscribeRequests.add(bare);
  subscribeQueue.push(bare);
  processSubscribeQueue();
}

async function processSubscribeQueue(){
  if(subscribeModalActive) return;
  const bare = subscribeQueue.shift();
  if(!bare) return;
  subscribeModalActive = true;
  const contact = S.roster[bare];
  const name = (contact && (contact.nick || contact.name)) || bare;
  const allow = await confirm(
    t('presence.subscribeTitle'),
    t('presence.subscribeDesc', {name, jid: bare}),
    {okText: t('presence.allow'), cancelText: t('presence.decline'), okDanger: false}
  );
  if(S.connection && S.connection.connected){
    if(allow){
      S.connection.send($pres({to: bare, type: 'subscribed'}));
      debugLog('presence: пользователь разрешил подписку для ' + bare);
    } else {
      S.connection.send($pres({to: bare, type: 'unsubscribed'}));
      debugLog('presence: пользователь отклонил подписку для ' + bare);
    }
  }
  pendingSubscribeRequests.delete(bare);
  subscribeModalActive = false;
  processSubscribeQueue(); // следующий запрос из очереди, если накопился
}
