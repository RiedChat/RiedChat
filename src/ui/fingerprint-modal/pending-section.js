// ============ ui/fingerprint-modal/pending-section.js ============
// Рендер и обработчики блока "новые устройства ждут места".
import { raw, setHTML } from '../../core/safe-html.js';
import { omemo } from '../../crypto/omemo/state.js';
import { pendingDeviceHtml } from './templates.js';

export function renderPendingSection(pendingBox, pending, fps, orphaned, activeChat, onChange){
  if(!pending.length){
    setHTML(pendingBox, null);
    return;
  }
  // В список "на замену" попадают и активные, и осиротевшие устройства -
  // лимит считает все запомненные ключи контакта, а не только те, что
  // сейчас в его device-list (см. crypto/identity-store.js:countTrustedDevices),
  // так что освободить слот можно и удалением давно неактуального ключа.
  setHTML(pendingBox, raw(pending.map(p => pendingDeviceHtml(p, fps.concat(orphaned))).join('')));
  pendingBox.querySelectorAll('.fp-accept-replace').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newAddr = btn.getAttribute('data-new-addr');
      const select = pendingBox.querySelector(`.fp-evict-select[data-new-addr="${newAddr}"]`);
      const evictAddr = select ? select.value : null;
      await omemo.acceptPendingDevice(activeChat, newAddr, evictAddr);
      onChange();
    });
  });
  pendingBox.querySelectorAll('.fp-discard-pending').forEach(btn => {
    btn.addEventListener('click', async () => {
      await omemo.discardPendingDevice(btn.getAttribute('data-new-addr'));
      onChange();
    });
  });
}
