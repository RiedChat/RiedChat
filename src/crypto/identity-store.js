// ===================== crypto/identity-store.js =====================
// Identity-ключи собеседников: TOFU-доверие, verified-флаг, лимит устройств
// и логи смены ключей/новых устройств (для UI-предупреждений).
// Реализация разбита по смыслу на src/crypto/identity-store/*.js,
// методы собираются в один класс через Object.assign(prototype, ...).
import { core } from './identity-store/core.js';
import { reverify } from './identity-store/reverify.js';
import { changeLog } from './identity-store/change-log.js';
import { deviceLog } from './identity-store/device-log.js';
import { deviceLimit } from './identity-store/device-limit.js';

export class IdentityStore{
  constructor(idb, ns){
    this.idb = idb;
    this.ns = ns; // 'omemo:' + bareJid + ':'
  }
}

Object.assign(IdentityStore.prototype, core, reverify, changeLog, deviceLog, deviceLimit);
