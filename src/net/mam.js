// ===================== mam.js =====================
// Синхронизация истории переписки с сервером через MAM (XEP-0313, urn:xmpp:mam:2).
//
// Идея: при каждом входе клиент запоминает id последнего увиденного сообщения
// в серверном архиве (свой на каждый аккаунт, хранится в js/history.js в сторе
// 'meta' под ключом 'mamLastId') и при следующем входе запрашивает у сервера
// только то, что появилось после этого id ("догоняющая" синхронизация - как
// делает сам Conversations). Если водяного знака ещё нет (совсем новое
// устройство/чистый браузер), тянем последние несколько сотен сообщений из
// архива постранично назад через RSM (XEP-0059), чтобы не заливать разом весь
// многолетний архив целиком.
//
// ВАЖНО про OMEMO: расшифровка сообщения необратимо продвигает состояние
// Double Ratchet. Если бы мы повторно расшифровывали уже виденные вживую
// сообщения, сессия шифрования сломалась бы. Поэтому watermark (mamLastId)
// обновляется также и при получении каждого живого сообщения (по его
// <stanza-id>, который добавляет mod_mam) - см. onMessage в xmpp.js. Так
// повторная выборка через MAM никогда не задевает уже расшифрованное.
//
// Файл разбит на три уровня ответственности:
//   net/mam/rsm-query.js - чистый XMPP/RSM-транспорт одной страницы (queryMamPage);
//   net/mam/backfill.js  - два алгоритма постраничной выкачки (catchUpSync/initialBackfill);
//   mam.js (этот файл)   - тонкая оркестрация: разбор архивного элемента в
//                          сообщение чата (доменная логика) + syncAccount(),
//                          который вызывает backfill, группирует по peer,
//                          сохраняет и обновляет UI/watermark.
import { IQ_TIMEOUT_MS, NS_DISCO_INFO } from '../core/constants.js';
import { toast } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { debugLog } from '../core/debug-log.js';
import { history } from './history.js';
import { parseMessageBody } from './message-body-parser.js';
import { queryMamPage } from './mam/rsm-query.js';
import { catchUpSync, initialBackfill } from './mam/backfill.js';
import { renderRoster } from '../ui/roster.js';
import { renderMessages } from '../ui/chat-view/render-messages.js';
import { t } from '../i18n/t.js';

const S = state;
const NS_MAM = 'urn:xmpp:mam:2';
// См. подробный комментарий в crypto/omemo/device-list-discovery.js - без явного
// таймаута sendIQ может зависнуть навсегда, если сервер не ответит.

export const mam = {
  supported: null, // null = ещё не проверяли; true/false после disco#info

  async checkSupport(){
    if(this.supported !== null) return this.supported;
    try{
      const iq = $iq({type:'get', to: S.myBareJid}).c('query', {xmlns: NS_DISCO_INFO});
      const res = await new Promise((resolve, reject) => S.connection.sendIQ(iq, resolve, reject, IQ_TIMEOUT_MS));
      this.supported = !!res.querySelector('feature[var="' + NS_MAM + '"]');
    }catch(e){
      debugLog('MAM: disco#info не удался - ' + (e && e.message ? e.message : e));
      this.supported = false;
    }
    return this.supported;
  },

  // Разбирает один архивный элемент в {peer, message} либо null, если сообщение
  // нужно пропустить (пустое, самому себе, не удалось расшифровать и т.п.).
  // Разбор самого тела (encrypted/body/fileUrl) - в net/message-body-parser.js,
  // тот же код использует и messaging.js:onMessage для живых сообщений.
  async processArchivedMessage(item){
    const inner = item.inner;
    const from = inner.getAttribute('from');
    const to = inner.getAttribute('to');
    if(!from) return null;
    const fromBare = Strophe.getBareJidFromJid(from);
    const toBare = to ? Strophe.getBareJidFromJid(to) : S.myBareJid;
    const out = fromBare === S.myBareJid;
    const peer = out ? toBare : fromBare;
    if(!peer || peer === S.myBareJid) return null;

    // null означает "адресовано другому нашему устройству" (и, в частности,
    // ЛЮБОЕ наше собственное отправленное OMEMO-сообщение, т.к. текущий
    // девайс не шифрует сам себе) - такие записи молча пропускаем, их
    // копия уже и так лежит в локальной истории с момента отправки.
    const parsed = await parseMessageBody(inner);
    if(!parsed || !parsed.body) return null;

    const time = item.stamp ? new Date(item.stamp).getTime() : Date.now();
    // Входящее, только что подтянутое из архива (пока клиент был оффлайн) -
    // считаем непрочитанным, как и живое сообщение из onMessage. Свои же
    // исходящие всегда read:true - их не с чем "прочитывать".
    const read = out || (S.activeChat === peer);
    return { peer, message: { id: item.id, mamId: item.id, body: parsed.body, time, out, encrypted: parsed.encrypted, read } };
  },

  // Основная точка входа: вызывается один раз при логине.
  async syncAccount(){
    if(!S.connection || !S.myBareJid) return;
    const supported = await this.checkSupport();
    if(!supported){
      debugLog('MAM: сервер не поддерживает urn:xmpp:mam:2 - синхронизация истории пропущена');
      return;
    }

    const lastId = await history.getMeta('mamLastId');
    const touchedPeers = new Set();
    let newestSeenId = lastId || null;

    const applyItems = async (items) => {
      for(const item of items){
        const parsed = await this.processArchivedMessage(item);
        if(parsed){
          S.messages[parsed.peer] = S.messages[parsed.peer] || [];
          const dup = S.messages[parsed.peer].some(m => m.mamId && m.mamId === parsed.message.mamId);
          if(!dup){
            S.messages[parsed.peer].push(parsed.message);
            S.roster[parsed.peer] = S.roster[parsed.peer] || {name: parsed.peer.split('@')[0], presence:'offline'};
            touchedPeers.add(parsed.peer);
          }
        }
      }
    };

    try{
      const result = lastId
        ? await catchUpSync(S.connection, lastId, applyItems)
        : await initialBackfill(S.connection, applyItems);
      if(result.newestSeenId) newestSeenId = result.newestSeenId;
    }catch(e){
      console.warn('MAM sync error', e);
      debugLog('MAM: ошибка синхронизации - ' + (e && e.message ? e.message : e));
      return;
    }

    for(const peer of touchedPeers){
      S.messages[peer].sort((a,b) => a.time - b.time);
      try{ await history.saveThread(peer, S.messages[peer]); }
      catch(e){ history.reportWriteError(e, t('history.ctxImportedMam')); }
    }
    if(newestSeenId && newestSeenId !== lastId){
      try{ await history.setMeta('mamLastId', newestSeenId); }
      catch(e){ console.warn('MAM: не удалось сохранить watermark синхронизации', e); }
    }
    if(touchedPeers.size){
      renderRoster();
      if(S.activeChat && touchedPeers.has(S.activeChat)) renderMessages();
      toast(t('mam.synced'));
      debugLog('MAM: синхронизировано, затронуто чатов: ' + touchedPeers.size);
    } else {
      debugLog('MAM: новых сообщений в архиве не найдено');
    }
  },
};
