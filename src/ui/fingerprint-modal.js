// ===================== ui/fingerprint-modal.js =====================
// Модалка OMEMO-отпечатков (свой + собеседника) с отметкой «проверен»: активные и осиротевшие устройства, блок «новое устройство ждёт места».
// Нативный <dialog>: Escape, Tab-цикл и возврат фокуса делает браузер; закрытие по крестику и фону - wireModalDismiss (features/chat-controls.js).
import { $ } from '../core/dom-utils.js';
import { cx, html, setHTML } from '../core/safe-html.js';
import { state } from '../core/state.js';
import { omemo } from '../crypto/omemo/state.js';
import { t } from '../i18n/t.js';

const emptyHtml = msg => html`<div class="roster-empty">${msg}</div>`;

// Блок «устройство + отпечаток»: префикс и id устройства, перенос строки, отпечаток.
const fingerprintIdHtml = (deviceId, fingerprint) =>
  html`<div class="fingerprint-id">${t('fingerprintModal.devicePrefix')} ${deviceId}<br>${fingerprint}</div>`;

// withTrust: true - активные: тумблер «проверен» + ручное «забыть» (нужно, если у контакта не было logout, retractSelf() не вызывался и device-id навсегда остался в device-list);
// false - только удаление (осиротевшие/устаревшие, crypto/omemo/trust.js:orphanedFingerprints).
function fingerprintRowHtml(f, { withTrust }){
  const trustBtn = html`<button class="${cx('fingerprint-trust', f.verified && 'trusted')}" data-action="verify" data-addr="${f.addr}">${f.verified ? '✓ ' + t('fingerprintModal.verified') : t('fingerprintModal.markVerified')}</button>`;
  const forgetBtn = html`<button class="fingerprint-forget" data-action="forget" data-addr="${f.addr}">${t('fingerprintModal.forget')}</button>`;
  return html`<div class="fingerprint-row">
    ${fingerprintIdHtml(f.deviceId, f.fingerprint || t('fingerprintModal.noSession'))}
    ${withTrust ? trustBtn : ''}${forgetBtn}
  </div>`;
}

// «Новое устройство ждёт места»: все слоты заняты (crypto/identity-store.js:getMaxDevicesPerContact), пришёл ключ ещё одного устройства. Можно заменить запомненный ключ новым или просто удалить один (освободить слот, с новым разобраться позже). Блок обёрнут в .fp-pending-item: кнопка находит свой <select> через closest().
function pendingDeviceHtml(pending, activeDevices){
  const options = activeDevices.map(f =>
    html`<option value="${f.addr}">${t('fingerprintModal.devicePrefix')} ${f.deviceId} - ${f.fingerprint || t('fingerprintModal.noFingerprint')}</option>`
  );
  return html`<div class="fp-pending-item">
    <div class="fingerprint-section-title">${t('fingerprintModal.limitReachedTitle')}</div>
    <div class="fingerprint-row">
      ${fingerprintIdHtml(pending.deviceId, pending.fingerprint)}
    </div>
    <div class="field">
      <label>${t('fingerprintModal.replaceOneOf')}</label>
      <select>${options}</select>
    </div>
    <button class="btn-primary" data-action="accept" data-addr="${pending.addr}">${t('fingerprintModal.replaceAndAccept')}</button>
    <button class="fingerprint-trust" data-action="discard" data-addr="${pending.addr}">${t('fingerprintModal.rejectNewDevice')}</button>
  </div>`;
}

function renderPendingSection(pendingBox, { pending, fps, orphaned }){
  // Пустой блок очищен в начале openFingerprintModal.
  if(!pending.length) return;
  // В «на замену» попадают активные и осиротевшие: лимит считает все запомненные ключи (crypto/identity-store.js:countTrustedDevices), поэтому слот освобождается и удалением неактуального ключа.
  setHTML(pendingBox, html`${pending.map(p => pendingDeviceHtml(p, fps.concat(orphaned)))}`);
}

function renderDeviceList(list, { deviceIds, fps, orphaned }){
  if(!fps.length && !orphaned.length){
    // Пусто - это либо «устройств нет», либо «все скрыты, ждут новой сессии после смены ключа» (crypto/omemo/trust.js:contactFingerprints/isPendingReverify). Ситуации разные, текст тоже.
    const msg = deviceIds.length
      ? t('fingerprintModal.pendingReverify')
      : t('fingerprintModal.noDevices');
    setHTML(list, emptyHtml(msg));
    return;
  }

  const activeHtml = fps.length
    ? fps.map(f => fingerprintRowHtml(f, { withTrust: true }))
    : emptyHtml(t('fingerprintModal.noActiveDevices'));
  const orphanedHtml = orphaned.length
    ? [
        html`<div class="fingerprint-section-title">${t('fingerprintModal.orphanedTitle')}</div>`,
        orphaned.map(f => fingerprintRowHtml(f, { withTrust: false })),
      ]
    : '';
  setHTML(list, html`${activeHtml}${orphanedHtml}`);
}

// Кнопки получают data-action в шаблонах выше; содержимое #fp-list и #fp-pending пересоздаётся при каждом открытии, поэтому один делегированный обработчик живёт на самой модалке (вешается один раз при загрузке модуля).
const actions = {
  verify: b => omemo.store.setVerified(b.dataset.addr, !b.classList.contains('trusted')),
  forget: b => omemo.forgetDevice(b.dataset.addr),
  accept: b => omemo.acceptPendingDevice(b.dataset.addr, b.closest('.fp-pending-item').querySelector('select').value),
  discard: b => omemo.store.discardPendingSlotDevice(b.dataset.addr),
};
$('fp-modal').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if(!btn) return;
  await actions[btn.dataset.action](btn);
  openFingerprintModal();
});

export async function openFingerprintModal(){
  const modal = $('fp-modal');
  const list = $('fp-list');
  const pendingBox = $('fp-pending');
  setHTML(list, emptyHtml(t('fingerprintModal.loading')));
  setHTML(pendingBox, null);
  if(!modal.open) modal.showModal(); // перерисовка после действия вызывает эту функцию повторно: showModal() на открытом диалоге бросает InvalidStateError

  const myFp = await omemo.myFingerprint();
  $('fp-my-value').textContent = myFp || t('fingerprintModal.unavailable');

  const limitSelect = $('fp-device-limit');
  limitSelect.value = String(await omemo.store.getMaxDevicesPerContact());
  limitSelect.onchange = async () => {
    await omemo.store.setMaxDevicesPerContact(limitSelect.value);
    limitSelect.value = String(await omemo.store.getMaxDevicesPerContact());
  };

  const chat = state.activeChat;
  if(!chat){ setHTML(list, emptyHtml(t('fingerprintModal.openChatFirst'))); return; }
  // orphaned - устройства, ключ которых мы запомнили, но которых нет в текущем device-list (контакт переустановил клиент, см. crypto/omemo/trust.js:orphanedFingerprints). Показываем отдельно, с ручным удалением.
  const [deviceIds, fps, orphaned, pending] = await Promise.all([
    omemo.getDeviceList(chat),
    omemo.contactFingerprints(chat),
    omemo.orphanedFingerprints(chat),
    omemo.pendingSlotDevices(chat),
  ]);

  renderPendingSection(pendingBox, { pending, fps, orphaned });
  renderDeviceList(list, { deviceIds, fps, orphaned });
}
