// ===================== crypto/omemo/device-list-discovery.js =====================
// Получение чужого device-list (omemo:2): сеть, кэш, обработка pubsub-пушей.
// Установление сессии на конкретное устройство - в session-builder.js.
import { NS_PUBSUB, NS_OMEMO_DEVICES } from '../../core/constants.js';
import { debugLog } from '../../core/debug-log.js';
import { sendIqAsync, iqErrorCondition } from '../../core/iq.js';

import { omemo } from './state.js';

// Без таймаута Strophe sendIQ ждёт ответ бесконечно (сообщения зависали на шифровании на 10-20 минут).
// sendIqAsync (core/iq.js) всегда передаёт таймаут, catch превращает errStanza === null в ошибку.

// Кэш device-list пригоден без сети, пока не придёт pubsub-пуш (_applyPushedDeviceList,
// pubsub#event в net/messaging/incoming.js) или не истечёт этот TTL - страховка на случай потерянного пуша.
const STALE_FALLBACK_MS = 30 * 60 * 1000;

// Короткий TTL для случая "запрос не удался" (PEP-узла ещё нет / сервер не ответил), отличный от
// подтверждённого пустого списка. Иначе проваленный запрос кэшировался на весь STALE_FALLBACK_MS,
// и после добавления контакта (узел ещё не создан) сообщения 30 минут уходили с вопросом
// "отправить незашифрованным?": пуш приходит только при взаимной presence-подписке
// (features/contacts.js, net/roster.js:addContact, net/presence/incoming.js).
const FAILED_FETCH_RETRY_MS = 15 * 1000;

// device id из <device id="..."/> внутри el (ответ на items-запрос или тело pubsub-пуша).
const parseDeviceIds = (el) => Array.from(el.querySelectorAll('device'))
  .map(d => parseInt(d.getAttribute('id'), 10))
  .filter(n => !isNaN(n));

Object.assign(omemo, {
  // ---------- получение чужого device-list ----------
  async _fetchDeviceListRaw(bareJid){
    const { $iq } = window;
    const iq = $iq({type:'get', to: bareJid})
      .c('pubsub', {xmlns: NS_PUBSUB})
      .c('items', {node: NS_OMEMO_DEVICES});
    let res;
    try{
      res = await sendIqAsync(iq, undefined, this.connection);
    }catch(errStanza){
      throw new Error(iqErrorCondition(errStanza), { cause: errStanza });
    }
    const ids = parseDeviceIds(res);
    debugLog('RAW IQ-result devicelist(v2) от ' + bareJid + ': ' + new XMLSerializer().serializeToString(res));
    return ids;
  },

  // Вызывается из обработчика pubsub-события при пуше device-list узла bareJid:
  // ids в теле пуша, лишний IQ не нужен.
  _applyPushedDeviceList(bareJid, ids){
    const merged = this._setDeviceList(bareJid, ids);
    debugLog('devicelist(v2) ' + bareJid + ': обновлено пушем, [' + merged.join(',') + ']');
  },

  // Разбирает <event xmlns='.../pubsub#event'><items node='...'><item><devices>...:
  // пуш от сервера контакта или от нашего сервера (публикация с другого нашего устройства).
  handlePubsubEvent(bareJid, eventEl){
    const itemsEl = eventEl.querySelector('items');
    if(!itemsEl || itemsEl.getAttribute('node') !== NS_OMEMO_DEVICES) return; // не наш узел

    const retractEl = itemsEl.querySelector('retract');
    if(retractEl){
      // Узел ретрактнут целиком (напр. retractSelf()) - список пуст до следующего успешного fetch.
      this._applyPushedDeviceList(bareJid, []);
      return;
    }
    const devicesEl = itemsEl.querySelector('item > devices');
    if(!devicesEl) return;
    this._applyPushedDeviceList(bareJid, parseDeviceIds(devicesEl));
  },

  // Единственное место записи deviceListCache/chatSupport. К ids добавляются learnedDevices
  // (приоритетнее PEP). fresh:false - свежесть только по TTL; confirmed - см. FAILED_FETCH_RETRY_MS.
  // Возвращает итоговый список ids.
  _setDeviceList(bareJid, ids, {fresh = true, confirmed} = {}){
    const learned = this.learnedDevices[bareJid];
    const ignored = this.ignoredDevices[bareJid];
    const all = learned ? Array.from(new Set([...ids, ...learned.ids])) : ids;
    const merged = ignored ? all.filter(id => !ignored.has(id)) : all;
    const rec = {ids: merged, ts: Date.now(), fresh};
    if(confirmed !== undefined) rec.confirmed = confirmed;
    this.deviceListCache[bareJid] = rec;
    this.chatSupport[bareJid] = merged.length > 0;
    return merged;
  },

  // Параллельные вызовы для одного bareJid (несколько сообщений подряд, шифрование + расшифровка) делят один IQ.
  getDeviceList(bareJid, forceRefresh){
    const cached = this.deviceListCache[bareJid];
    const ttl = (cached && cached.confirmed === false) ? FAILED_FETCH_RETRY_MS : STALE_FALLBACK_MS;
    const isFresh = cached && (cached.fresh || (Date.now() - cached.ts) < ttl);
    if(!forceRefresh && isFresh) return Promise.resolve(cached.ids);

    const inflight = (this._deviceListInflight = this._deviceListInflight || {});
    if(!inflight[bareJid]){
      inflight[bareJid] = this._loadDeviceList(bareJid).finally(() => { delete inflight[bareJid]; });
    }
    return inflight[bareJid];
  },

  async _loadDeviceList(bareJid){
    let pepIds = null;
    try{
      pepIds = await this._fetchDeviceListRaw(bareJid);
      debugLog('devicelist(v2) ' + bareJid + ' OK: [' + pepIds.join(',') + ']');
    }catch(e){
      debugLog('devicelist(v2) ' + bareJid + ' FAIL: ' + e.message);
    }

    // PEP-узел может врать (мёртвый item старого клиента). learnedDevices (реально виденные sid) надёжнее,
    // объединение делает _setDeviceList.
    if(pepIds === null && !this.learnedDevices[bareJid]){
      // Ни PEP, ни история ничего не дали - устройств нет, но confirmed:false:
      // повтор через FAILED_FETCH_RETRY_MS, а не через STALE_FALLBACK_MS.
      return this._setDeviceList(bareJid, [], {fresh: false, confirmed: false});
    }

    return this._setDeviceList(bareJid, pepIds || [], {confirmed: true});
  },
});
