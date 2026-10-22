// ===================== ui/confirm-modal.js =====================
// Универсальная confirm-модалка на нативном <dialog>. Без зависимостей от истории, рендера и крипто-хранилища (как vault-modal.js): её импортируют net/ и features/.
import { $, showDialog } from '../core/dom-utils.js';
import { t } from '../i18n/t.js';

// Возвращает Promise<boolean>: true - подтверждение, false - отмена/фон/Escape.
// okText/cancelText переопределяют подписи (по умолчанию «Удалить»/«Отмена»).
// okDanger=false убирает красный стиль (для недеструктивных подтверждений, например отправки без шифрования).
export async function confirmDialog(title, desc, { okText = t('modals.deleteBtn'), cancelText = t('modals.cancelBtn'), okDanger = true } = {}){
  $('confirm-title').textContent = title;
  $('confirm-desc').textContent = desc || '';
  $('confirm-ok').textContent = okText;
  $('confirm-cancel').textContent = cancelText;
  $('confirm-ok').classList.toggle('danger', okDanger);
  return (await showDialog($('confirm-modal'))) === 'ok';
}

// Недеструктивное подтверждение/выбор: обе подписи заданы явно, красного стиля нет (разрешить/отклонить, отправить/отмена).
export const confirmChoice = (title, desc, okText, cancelText) =>
  confirmDialog(title, desc, { okText, cancelText, okDanger: false });
