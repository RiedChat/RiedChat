// ===================== crypto/omemo/device-list-publish.js =====================
// Публикация и вычёркивание собственного device-list (omemo:2) в PEP.
// Bundle - в omemo/bundle.js, публикация PEP-узла - в pep/publish-node.js.
import { NS_OMEMO, NS_OMEMO_DEVICES, NS_OMEMO_BUNDLES_PREFIX } from '../../core/constants.js';
import { debugLog } from '../../core/debug-log.js';
import { publishItem, deleteNode } from '../pep/publish-node.js';

import { omemo } from './state.js';


Object.assign(omemo, {
  // Проверяет, жив ли bundle у deviceId. Мёртвые ID (хранилище почищено) ломают шифрование:
  // сессия на них не установится, и если они единственные - сообщение уходит в открытую.
  async _isDeviceAlive(id){
    try{ await this._fetchBundle(this.myBareJid, id); return true; }
    catch{ return false; }
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

  async _publishIds(ids){
    const itemsXml = ids.map(id => `<device id="${id}"/>`).join('');
    await publishItem(this.connection, NS_OMEMO_DEVICES, 'current', `<devices xmlns="${NS_OMEMO}">${itemsXml}</devices>`);
  },

  async _publishDeviceList(){
    let current = [];
    try{ current = await this._fetchDeviceListRaw(this.myBareJid); }catch{ /* узла ещё нет */ }
    // Дубли id в списке - одна из причин "засорения": убираем при каждой публикации.
    let ids = Array.from(new Set(current));
    if(!ids.includes(this.deviceId)) ids.push(this.deviceId);
    ids = await this._pruneDeadIds(ids);

    // Ничего не изменилось (мы уже в списке, мёртвых и дублей нет) - публиковать нечего.
    const unchanged = ids.length === current.length && ids.every(id => current.includes(id));
    if(unchanged){
      debugLog('device-list(v2): без изменений, публикацию пропускаю');
      return;
    }
    await this._publishIds(ids);
  },

  // Вычёркивает свой deviceId из device-list, публикуя item без себя. Сам узел не трогаем:
  // пересоздание при логине зависит от auto-create сервера (не гарантировано XEP-0060).
  // Если узла нет - нечего вычёркивать.
  async _retractSelfFromDeviceList(){
    let ids;
    try{ ids = await this._fetchDeviceListRaw(this.myBareJid); }
    catch{ return; } // узла нет - нечего чистить
    ids = ids.filter(id => id !== this.deviceId);
    await this._publishIds(ids);
  },

  // Зачистка присутствия в PEP перед необратимым выходом (ui/modals.js logout()):
  // вычёркиваем себя из device-list (узел не удаляем) и удаляем bundle-узел этого устройства
  // (при следующем входе создаётся новый под новым deviceId). Вызывать ДО disconnect().
  async retractSelf(){
    if(!this.ready || !this.connection) return;
    await this._retractSelfFromDeviceList();
    await deleteNode(this.connection, NS_OMEMO_BUNDLES_PREFIX + this.deviceId);
    debugLog('[omemo] retractSelf: device ' + this.deviceId + ' вычеркнут из device-list, bundle-узел удалён, для ' + this.myBareJid);
  },
});
