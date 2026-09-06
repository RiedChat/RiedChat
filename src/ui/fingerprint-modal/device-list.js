// ============= ui/fingerprint-modal/device-list.js =============
// Рендер и обработчики основного списка отпечатков (активные + осиротевшие).
import { html, raw, setHTML } from '../../core/safe-html.js';
import { omemo } from '../../crypto/omemo/state.js';
import { fingerprintRowHtml } from './templates.js';
import { t } from '../../i18n/t.js';

export function renderDeviceList(list, { deviceIds, fps, orphaned, activeChat, onChange }){
  if(!fps.length && !orphaned.length){
    // Пусто может значить и "устройств нет вовсе", и "все известные устройства
    // сейчас скрыты - ждут новой сессии после смены ключа" (см.
    // crypto/omemo/trust.js:contactFingerprints/isPendingReverify) - это разные
    // ситуации, не стоит писать про них одно и то же.
    const msg = deviceIds.length
      ? t('fingerprintModal.pendingReverify')
      : t('fingerprintModal.noDevices');
    setHTML(list, html`<div class="roster-empty">${msg}</div>`);
    return;
  }

  const activeHtml = fps.length
    ? fps.map(f => fingerprintRowHtml(f, {action:'trust'})).join('')
    : `<div class="roster-empty">${t('fingerprintModal.noActiveDevices')}</div>`;
  const orphanedHtml = orphaned.length
    ? `<div class="fingerprint-section-title">${t('fingerprintModal.orphanedTitle')}</div>`
      + orphaned.map(f => fingerprintRowHtml(f, {action:'forget'})).join('')
    : '';
  setHTML(list, raw(activeHtml + orphanedHtml));

  list.querySelectorAll('.fingerprint-trust:not(.fingerprint-forget)').forEach(btn => {
    btn.addEventListener('click', async () => {
      const addr = btn.getAttribute('data-addr');
      const nowTrusted = !btn.classList.contains('trusted');
      await omemo.setVerified(addr, nowTrusted);
      onChange();
    });
  });
  list.querySelectorAll('.fingerprint-forget').forEach(btn => {
    btn.addEventListener('click', async () => {
      const addr = btn.getAttribute('data-addr');
      await omemo.forgetDevice(activeChat, addr);
      onChange();
    });
  });
}
