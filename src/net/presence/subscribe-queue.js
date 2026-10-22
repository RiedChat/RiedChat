import { debugLog } from '../../core/debug-log.js';
import { contactName } from '../../core/dom-utils.js';
import { state } from '../../core/state.js';
import { t } from '../../i18n/t.js';
import { confirmChoice } from '../../ui/confirm-modal.js';

const pending = new Set();
let chain = Promise.resolve();

export function queueSubscriptionApproval(bare){
  if(pending.has(bare)) return;
  pending.add(bare);
  chain = chain
    .then(() => askSubscription(bare))
    .catch(() => {})
    .finally(() => pending.delete(bare));
}

async function askSubscription(bare){
  const name = contactName(bare);
  const allow = await confirmChoice(
    t('presence.subscribeTitle'),
    t('presence.subscribeDesc', {name, jid: bare}),
    t('presence.allow'),
    t('presence.decline')
  );
  if(!state.connection?.connected) return;
  state.connection.send($pres({to: bare, type: allow ? 'subscribed' : 'unsubscribed'}));
  debugLog('presence: пользователь ' + (allow ? 'разрешил' : 'отклонил') + ' подписку для ' + bare);
}
