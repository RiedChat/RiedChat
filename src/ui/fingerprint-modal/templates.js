// ============= ui/fingerprint-modal/templates.js =============
// HTML-шаблоны для модалки OMEMO-отпечатков: строка устройства и блок
// "новое устройство ждёт места".
import { html, raw } from '../../core/safe-html.js';
import { t } from '../../i18n/t.js';

export function fingerprintRowHtml(f, opts){
  // opts.action: 'trust' - активные устройства: тумблер "проверен" + кнопка
  // ручного "забыть" (нужна, если у контакта, например, не было настоящего
  // logout на другом устройстве - retractSelf() тогда не вызывался, и
  // device-id остаётся в device-list навсегда, никогда не станет "осиротевшим",
  // но пользователь всё равно должен иметь возможность удалить его вручную);
  // 'forget' - только кнопка удаления (осиротевшие/устаревшие устройства,
  // см. crypto/omemo/trust.js:orphanedFingerprints).
  const trustBtn = html`<button class="fingerprint-trust ${raw(f.verified ? 'trusted' : '')}" data-addr="${f.addr}">
        ${f.verified ? '✓ ' + t('fingerprintModal.verified') : t('fingerprintModal.markVerified')}
      </button>`;
  const forgetBtn = html`<button class="fingerprint-trust fingerprint-forget" data-addr="${f.addr}">${t('fingerprintModal.forget')}</button>`;
  const btnHtml = opts.action === 'forget'
    ? forgetBtn
    : raw(String(trustBtn) + String(forgetBtn));
  return String(html`<div class="fingerprint-row">
    <div class="fingerprint-id">${t('fingerprintModal.devicePrefix')} ${String(f.deviceId)}<br>${f.fingerprint || t('fingerprintModal.noSession')}</div>
    ${raw(String(btnHtml))}
  </div>`);
}

// Блок "новое устройство ждёт места": показывается, когда для контакта уже
// занято максимум слотов (см. crypto/identity-store.js:getMaxDevicesPerContact)
// и пришёл ключ ещё одного устройства. Даёт выбрать: заменить один из уже
// запомненных ключей на новый, либо просто удалить один (без принятия
// нового - например, если пользователь хочет освободить слот, а с новым
// устройством разберётся позже).
export function pendingDeviceHtml(pending, activeDevices){
  const options = activeDevices.map(f =>
    String(html`<option value="${f.addr}">${t('fingerprintModal.devicePrefix')} ${String(f.deviceId)} - ${f.fingerprint || t('fingerprintModal.noFingerprint')}</option>`)
  ).join('');
  return String(html`<div class="fingerprint-section-title">${t('fingerprintModal.limitReachedTitle')}</div>
    <div class="fingerprint-row">
      <div class="fingerprint-id">${t('fingerprintModal.devicePrefix')} ${String(pending.deviceId)}<br>${pending.fingerprint}</div>
    </div>
    <div class="field">
      <label>${t('fingerprintModal.replaceOneOf')}</label>
      <select class="fp-evict-select" data-new-addr="${pending.addr}">${raw(options)}</select>
    </div>
    <button class="btn-primary fp-accept-replace" data-new-addr="${pending.addr}">${t('fingerprintModal.replaceAndAccept')}</button>
    <button class="fingerprint-trust fp-discard-pending" data-new-addr="${pending.addr}">${t('fingerprintModal.rejectNewDevice')}</button>`);
}
