// ===================== crypto/omemo/device-list-publish.js =====================
// Публикация и вычёркивание собственного device-list (omemo:2) в PEP.
// Публикация bundle - в crypto/omemo/bundle.js; общий механизм публикации
// PEP-узла (XEP-0060) - в crypto/pep/publish-node.js.
import { NS_OMEMO, NS_OMEMO_DEVICES, NS_OMEMO_BUNDLES_PREFIX } from '../../core/constants.js';
import { omemo } from './state.js';
import { debugLog } from '../../core/debug-log.js';

Object.assign(omemo, {
  // Проверяет, что у чужого (в т.ч. нашего старого) deviceId ещё жив bundle.
  // Используется, чтобы не копить в собственном device-list ID устройств,
  // с которыми годами назад собеседник (или мы сами) тестировался, а потом
  // почистил хранилище - такие "мёртвые" ID только ломают шифрование:
  // сессия на них никогда не установится, а если это ЕДИНСТВЕННЫЕ ID,
  // на которые получилось (или не получилось) зашифровать, сообщение
  // молча уходит в открытую.
  async _isDeviceAlive(id){
    try{ await this._fetchBundle(this.myBareJid, id); return true; }
    catch(e){ return false; }
  },

  async _pruneDeadIds(ids){
    const alive = [];
    for(const id of ids){
      if(id === this.deviceId){ alive.push(id); continue; } // себя не проверяем
      if(await this._isDeviceAlive(id)) alive.push(id);
      else debugLog('device-list(v2): удаляю мёртвый ID ' + id + ' (bundle не найден/битый)');
    }
    return alive;
  },

  async _publishDeviceList(){
    let ids = [];
    try{ ids = await this._fetchDeviceListRaw(this.myBareJid); }catch(e){ /* узла ещё нет */ }
    if(!ids.includes(this.deviceId)) ids.push(this.deviceId);
    ids = await this._pruneDeadIds(ids);

    const itemsXml = ids.map(id => `<device id="${id}"/>`).join('');
    const xml = `<devices xmlns="${NS_OMEMO}">${itemsXml}</devices>`;
    await this._publishItem(NS_OMEMO_DEVICES, 'current', xml);
  },

  // Вычёркивает свой deviceId из существующего device-list, публикуя обновлённый
  // item без себя. НЕ трогает сам узел device-list - publish в уже существующий
  // узел работает всегда, а вот пересоздание узла при следующем логине зависит от
  // того, поддерживает ли сервер auto-create при publish (не гарантировано XEP-0060).
  // Если узла ещё нет (сервер новый / список никогда не публиковался) - нечего вычёркивать.
  async _retractSelfFromDeviceList(){
    let ids = [];
    try{ ids = await this._fetchDeviceListRaw(this.myBareJid); }
    catch(e){ return; } // узла нет - нечего чистить
    ids = ids.filter(id => id !== this.deviceId);
    const itemsXml = ids.map(id => `<device id="${id}"/>`).join('');
    const xml = `<devices xmlns="${NS_OMEMO}">${itemsXml}</devices>`;
    await this._publishItem(NS_OMEMO_DEVICES, 'current', xml);
  },

  // Зачистка своего присутствия в PEP перед необратимым выходом (см. ui/modals.js
  // logout()). Вычёркиваем себя из device-list публикацией обновлённого item -
  // сам узел device-list не удаляется, чтобы не зависеть от auto-create сервера
  // при следующем логине. Bundle-узел именно этого устройства удаляем полностью -
  // он безопасен к удалению, т.к. при следующем входе создаётся новый bundle под
  // новым deviceId. Нужно вызывать ДО disconnect() - пока соединение ещё живо.
  async retractSelf(){
    if(!this.ready || !this.connection) return;
    await this._retractSelfFromDeviceList();
    await this._deleteNode(NS_OMEMO_BUNDLES_PREFIX + this.deviceId);
    debugLog('[omemo] retractSelf: device ' + this.deviceId + ' вычеркнут из device-list, bundle-узел удалён, для ' + this.myBareJid);
  },
});
