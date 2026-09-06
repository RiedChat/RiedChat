// ===================== ui/fingerprint-modal.js =====================
// Модалка с OMEMO-отпечатками (свой + собеседника) и отметкой "проверен".
// Логика вынесена в ./fingerprint-modal/: templates.js (HTML-шаблоны),
// pending-section.js (блок "новое устройство ждёт места"),
// device-list.js (список отпечатков активных/осиротевших устройств).
import { html, setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { $ } from '../core/dom-utils.js';
import { omemo } from '../crypto/omemo/state.js';
import { renderPendingSection } from './fingerprint-modal/pending-section.js';
import { renderDeviceList } from './fingerprint-modal/device-list.js';
import { t } from '../i18n/t.js';

const S = state;

export async function openFingerprintModal(){
  const modal = $('fp-modal');
  const list = $('fp-list');
  const pendingBox = $('fp-pending');
  setHTML(list, html`<div class="roster-empty">${t('fingerprintModal.loading')}</div>`);
  setHTML(pendingBox, null);
  modal.classList.add('active');

  const myFp = await omemo.myFingerprint();
  $('fp-my-value').textContent = myFp || t('fingerprintModal.unavailable');

  const limitSelect = $('fp-device-limit');
  limitSelect.value = String(await omemo.getMaxDevicesPerContact());
  limitSelect.onchange = async () => {
    await omemo.setMaxDevicesPerContact(limitSelect.value);
    limitSelect.value = String(await omemo.getMaxDevicesPerContact());
  };

  if(!S.activeChat){ setHTML(list, html`<div class="roster-empty">${t('fingerprintModal.openChatFirst')}</div>`); return; }
  const deviceIds = await omemo.getDeviceList(S.activeChat);
  const fps = await omemo.contactFingerprints(S.activeChat);
  // Устройства, чей ключ мы когда-то запомнили, но которых больше нет в
  // текущем device-list контакта (обычно - контакт переустановил клиент и
  // получил новый device-id, старый ключ остался "мёртвым грузом", см.
  // crypto/omemo/trust.js:orphanedFingerprints) - показываем отдельно,
  // с возможностью вручную удалить.
  const orphaned = await omemo.orphanedFingerprints(S.activeChat);
  const pending = await omemo.pendingSlotDevices(S.activeChat);

  renderPendingSection(pendingBox, pending, fps, orphaned, S.activeChat, openFingerprintModal);
  renderDeviceList(list, { deviceIds, fps, orphaned, activeChat: S.activeChat, onChange: openFingerprintModal });
}
