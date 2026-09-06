// ===================== crypto/omemo/device-list-discovery.js =====================
// Получение чужого device-list (omemo:2): сеть, кэш, обработка pubsub-пушей.
// Установление сессии на конкретное устройство - в session-builder.js.
import { NS_PUBSUB, NS_OMEMO_DEVICES, IQ_TIMEOUT_MS } from '../../core/constants.js';
import { omemo } from './state.js';
import { debugLog } from '../../core/debug-log.js';

// ВАЖНО: без явного таймаута Strophe.Connection.sendIQ ждёт ответ сервера
// БЕСКОНЕЧНО - ни onSuccess, ни onError не вызываются, если ответный <iq>
// просто не пришёл (потерян, сервер перегружен/подвис и т.п.). На практике
// это давало эффект "сообщения зависают на шифровании на 10-20 минут без
// единой ошибки" ровно тогда, когда серверу было чем заняться (например,
// сразу после передачи крупного файла через HTTP Upload). Явный таймаут
// гарантирует, что промис settled в разумный срок, а errback (уже умеющий
// обрабатывать errStanza === null как "нет ответа/таймаут") корректно
// превратит зависание в обычную ошибку.

// Кэш device-list считается пригодным без обращения к сети, пока не придёт
// pubsub-пуш об изменении узла (см. _applyPushedDeviceList и обработчик
// pubsub#event в net/messaging/incoming.js) либо пока не истечёт эта подстраховка на
// случай, если push потерялся (сервер/контакт не поддерживает +notify,
// разрыв соединения между публикацией и подпиской и т.п.). Раньше здесь стоял
// безусловный forceRefresh на КАЖДУЮ отправку сообщения - это гарантировало
// актуальность ценой сетевого round-trip перед каждым send. Теперь
// актуальность поддерживается пушами, а этот TTL - только сеть безопасности.
const STALE_FALLBACK_MS = 30 * 60 * 1000;

// Отдельный, короткий TTL для случая "запрос вообще не удался" (PEP-узла ещё
// нет / сервер не ответил) - совсем не то же самое, что "спросили и получили
// подтверждённый пустой список". Раньше оба случая падали в один и тот же
// deviceListCache с одним STALE_FALLBACK_MS: `fresh:false` ставился, но
// isFresh ниже всё равно смотрит на `Date.now() - cached.ts < STALE_FALLBACK_MS`,
// а ts у свежего проваленного запроса == "только что" - то есть следующие
// 30 минут запрос фактически не повторялся, хотя комментарий обещал обратное.
// Именно это и рвёт шифрование сразу после добавления контакта: PEP-узел
// собеседника ещё не существует (он не логинился с этим клиентом ни разу),
// _fetchDeviceListRaw падает, пустой результат кэшируется - и следующие 30
// минут все сообщения уходят с запросом "отправить незашифрованным?", даже
// если собеседник за это время зашёл и опубликовал ключи (push долетит,
// только если presence-подписка уже взаимная - а на новом контакте это ещё
// не так, см. features/contacts.js/net/roster.js:addContact и presence
// subscribe-флоу в net/presence/incoming.js).
const FAILED_FETCH_RETRY_MS = 15 * 1000;

Object.assign(omemo, {
  // ---------- получение чужого device-list ----------
  async _fetchDeviceListRaw(bareJid){
    const { $iq } = window;
    return new Promise((resolve, reject) => {
      const iq = $iq({type:'get', to: bareJid})
        .c('pubsub', {xmlns: NS_PUBSUB})
        .c('items', {node: NS_OMEMO_DEVICES});
      this.connection.sendIQ(iq, (res) => {
        const devices = res.querySelectorAll('device');
        const ids = Array.from(devices).map(d => parseInt(d.getAttribute('id'), 10)).filter(n => !isNaN(n));
        debugLog('RAW IQ-result devicelist(v2) от ' + bareJid + ': ' + new XMLSerializer().serializeToString(res));
        resolve(ids);
      }, (errStanza) => {
        const cond = errStanza ? errStanza.querySelector('error') : null;
        const condName = cond ? Array.from(cond.children).map(c => c.tagName).join(',') : 'нет ответа/таймаут';
        reject(new Error(condName));
      }, IQ_TIMEOUT_MS);
    });
  },

  // Вызывается из обработчика pubsub-события, когда сервер сам присылает нам
  // изменившийся device-list узла bareJid - это единственный надёжный триггер
  // "кэш устарел", не требующий лишнего IQ (ids приезжают прямо в теле пуша).
  _applyPushedDeviceList(bareJid, ids){
    const learned = this.learnedDevices[bareJid];
    const merged = learned ? Array.from(new Set([...ids, ...learned.ids])) : ids;
    this.deviceListCache[bareJid] = {ids: merged, ts: Date.now(), protocol: 'v2', fresh: true};
    this.chatSupport[bareJid] = merged.length > 0;
    debugLog('devicelist(v2) ' + bareJid + ': обновлено пушем, [' + merged.join(',') + ']');
  },

  // Разбирает <event xmlns='.../pubsub#event'><items node='...'><item><devices>...
  // приходящее либо от сервера контакта (когда ОН публикует новый device-list, а
  // наш сервер авто-подписал нас благодаря нашим +notify caps), либо от нашего же
  // сервера при публикации с другого нашего устройства. Список устройств приезжает
  // прямо в теле пуша - дополнительный IQ-запрос не нужен.
  handlePubsubEvent(bareJid, eventEl){
    const itemsEl = eventEl.querySelector('items');
    if(!itemsEl || itemsEl.getAttribute('node') !== NS_OMEMO_DEVICES) return; // не наш узел

    const retractEl = itemsEl.querySelector('retract');
    if(retractEl){
      // Узел ретрактнут целиком (например, контакт вычеркнул устройство при выходе,
      // см. retractSelf()) - считаем список устройств пустым до следующего успешного fetch.
      this._applyPushedDeviceList(bareJid, []);
      return;
    }
    const devicesEl = itemsEl.querySelector('item > devices');
    if(!devicesEl) return;
    const ids = Array.from(devicesEl.querySelectorAll('device'))
      .map(d => parseInt(d.getAttribute('id'), 10)).filter(n => !isNaN(n));
    this._applyPushedDeviceList(bareJid, ids);
  },

  async getDeviceList(bareJid, forceRefresh){
    const cached = this.deviceListCache[bareJid];
    // "Свежо", если явно помечено пушем как fresh, либо ещё не истёк
    // подстраховочный TTL - и вызывающий код не настаивает на forceRefresh
    // (сейчас это делает только явное ручное "обновить ключи" в UI, если есть).
    // confirmed !== false: и явный push (fresh:true), и подтверждённый пустой
    // список (confirmed:true) живут полный STALE_FALLBACK_MS. Непровалившийся-
    // но-неподтверждённый запрос (confirmed:false - PEP-узла ещё не было/сервер
    // не ответил) считается свежим только FAILED_FETCH_RETRY_MS - иначе только
    // что добавленный контакт, который ещё не успел опубликовать ключи, застревает
    // без OMEMO на все 30 минут вместо пары секунд ретрая.
    const ttl = (cached && cached.confirmed === false) ? FAILED_FETCH_RETRY_MS : STALE_FALLBACK_MS;
    const isFresh = cached && (cached.fresh || (Date.now() - cached.ts) < ttl);
    if(!forceRefresh && isFresh) return cached.ids;

    let pepIds = null;
    try{
      pepIds = await this._fetchDeviceListRaw(bareJid);
      debugLog('devicelist(v2) ' + bareJid + ' OK: [' + pepIds.join(',') + ']');
    }catch(e){
      debugLog('devicelist(v2) ' + bareJid + ' FAIL: ' + e.message);
    }

    // PEP-узел может врать (мёртвый item от старого клиента/теста, который никто не чистил).
    // То, что мы реально видели во входящих sid (learnedDevices), - более надёжный источник.
    const learned = this.learnedDevices[bareJid];
    let finalIds = pepIds || [];
    if(learned){
      finalIds = Array.from(new Set([...finalIds, ...learned.ids]));
    }

    if(pepIds === null && !learned){
      // Ни PEP, ни исторические данные ничего не дали - считаем, что устройств нет,
      // но помечаем confirmed:false, чтобы следующий getDeviceList (без forceRefresh)
      // повторил попытку уже через FAILED_FETCH_RETRY_MS, а не через полный
      // 30-минутный STALE_FALLBACK_MS (см. комментарий у FAILED_FETCH_RETRY_MS выше).
      this.deviceListCache[bareJid] = {ids: [], ts: Date.now(), protocol: 'v2', fresh: false, confirmed: false};
      this.chatSupport[bareJid] = false;
      return [];
    }

    this.deviceListCache[bareJid] = {ids: finalIds, ts: Date.now(), protocol: 'v2', fresh: true, confirmed: true};
    this.chatSupport[bareJid] = finalIds.length > 0;
    return finalIds;
  },

  // Оставлен для обратной совместимости вызовов из trust.js/UI - протокол теперь всегда один.
  protocolFor(_bareJid){
    return 'v2';
  },
});
