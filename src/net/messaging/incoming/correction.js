// ================ net/messaging/incoming/correction.js ================
// XEP-0308: применение входящего исправления уже отправленного сообщения.
import { state } from '../../../core/state.js';
import { history } from '../../history.js';
import { t } from '../../../i18n/t.js';
import { parseMessageBody } from '../../message-body-parser.js';
import { renderMessages } from '../../../ui/chat-view/render-messages.js';

const S = state;

// Применяет входящее исправление (XEP-0308): находит своё же сообщение с
// id === id из <replace> и заменяет ему body. Расшифровка/разбор тела - тот
// же parseMessageBody, что и для обычного входящего сообщения (correction
// может быть OMEMO-зашифрован точно так же, как и оригинал).
export async function handleCorrection(stanza, bare){
  const replaceEl = stanza.querySelector('replace');
  const targetId = replaceEl && replaceEl.getAttribute('id');
  if(!targetId) return;
  // Как и в message-handler.js: незашифрованное "эхо" собственного
  // исправления самим себе игнорируем - это не значит, что исправление не
  // применилось, просто мы уже применили его локально при отправке (см.
  // net/messaging/outgoing.js:editMessage).
  if(bare === S.myBareJid && !stanza.querySelector('encrypted')) return;

  const parsed = await parseMessageBody(stanza);
  if(!parsed) return; // OMEMO-конверт адресован другому нашему устройству
  if(parsed.encrypted && bare === S.myBareJid) return;
  if(!parsed.body) return;

  const list = S.messages[bare];
  if(!list) return;
  // XEP-0308 разрешает исправлять только своё же сообщение: правку из чата
  // с контактом (bare !== myBareJid) можно применять лишь к сообщению,
  // которое реально прислал этот контакт (out:false) - иначе собеседник
  // мог бы прислать <replace id="..."> с id НАШЕГО исходящего сообщения
  // (out:true) и подменить в нашей же истории то, что мы якобы написали
  // сами (подделка переписки). Симметрично: эхо собственной правки самим
  // себе (bare === myBareJid) может относиться только к нашему же
  // исходящему сообщению (out:true), см. net/messaging/outgoing/edit.js,
  // где та же проверка сделана на исходящем пути.
  const expectedOut = bare === S.myBareJid;
  const target = list.find(m => m && m.id === targetId && !!m.out === expectedOut);
  if(!target) return; // сообщение ещё не попало в локальную историю или чужое - тихо игнорируем
  target.body = parsed.body;
  target.encrypted = parsed.encrypted;
  target.edited = true;
  history.saveThread(bare, list).catch(e => history.reportWriteError(e, t('history.ctxChatHistory')));
  if(S.activeChat === bare) renderMessages();
}
