// ============= crypto/identity-store/reverify.js =============
// Пометка "ждёт переверификации" - устройство скрыто из списка отпечатков
// до установления новой Signal-сессии.
export const reverify = {
  async setPendingReverify(identifier, pending){
    await this.idb.set(this.ns + 'pendingReverify:' + identifier, !!pending);
  },
  async isPendingReverify(identifier){
    return !!(await this.idb.get(this.ns + 'pendingReverify:' + identifier));
  },
  // Снимает пометку "ждёт переверификации" - вызывается, когда для этого
  // identifier реально устанавливается НОВАЯ Signal-сессия (устройство
  // "запросилось само" заново - см. crypto/omemo/decrypt.js для входящего
  // случая и crypto/omemo/session-builder.js:_ensureSession для исходящего).
  // После этого устройство снова появляется в списке отпечатков (см.
  // crypto/omemo/trust.js:contactFingerprints) и его можно отметить проверенным.
  async clearPendingReverify(identifier){
    await this.idb.set(this.ns + 'pendingReverify:' + identifier, false);
  },
};
