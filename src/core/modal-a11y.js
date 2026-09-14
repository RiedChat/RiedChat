// ===================== core/modal-a11y.js =====================
// Общая доступность модалок по WAI-ARIA APG Dialog (Modal) Pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/):
//   - Escape закрывает диалог;
//   - фокус захватывается внутри диалога (Tab/Shift+Tab не уходят за его
//     пределы, пока диалог открыт);
//   - при открытии фокус уходит на первый фокусируемый элемент диалога;
//   - при закрытии фокус возвращается на элемент, который его открыл.
// До этого во всех модалках проекта (confirm-modal, vault-modal, fp-modal,
// profile-modal, search-modal) ничего из перечисленного не было: Escape не
// закрывал, Tab свободно уходил за пределы диалога на элементы под ним,
// фокус после закрытия просто оставался там, где был.
const FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// offsetParent === null - надёжный (и дешёвый, без getComputedStyle) способ
// отсеять display:none/скрытые ветки разметки; для элемента с
// position:fixed offsetParent тоже null, но в модалках проекта фокусируемые
// элементы так не позиционируются.
function focusableEls(container){
  return Array.from(container.querySelectorAll(FOCUSABLE_SEL))
    .filter(el => el.offsetParent !== null);
}

// Захватывает фокус внутри box (обычно .modal-box - именно он, а не весь
// .modal-overlay, чтобы полупрозрачный фон не попадал в цепочку табуляции)
// на время жизни диалога и вызывает onEscape() по Escape. Возвращает
// cleanup() - его нужно вызвать при закрытии диалога: он снимает
// обработчик и возвращает фокус на элемент, который был активен до
// открытия (или на явно переданный elementToRestoreFocus).
export function trapFocus(box, onEscape, elementToRestoreFocus){
  const prevFocused = elementToRestoreFocus || document.activeElement;

  const onKeydown = (e) => {
    if(e.key === 'Escape'){ onEscape(); return; }
    if(e.key !== 'Tab') return;
    const items = focusableEls(box);
    if(!items.length) return;
    const first = items[0], last = items[items.length - 1];
    // Циклическая табуляция: со последнего элемента Tab уводит на первый,
    // с первого Shift+Tab - на последний, а не за пределы диалога.
    if(e.shiftKey && document.activeElement === first){
      e.preventDefault(); last.focus();
    } else if(!e.shiftKey && document.activeElement === last){
      e.preventDefault(); first.focus();
    }
  };
  box.addEventListener('keydown', onKeydown);

  // rAF, а не .focus() сразу: в момент вызова trapFocus() диалог обычно
  // только что получил класс 'active' в этом же тике - без кадра ожидания
  // offsetParent элементов внутри ещё null (диалог визуально не
  // "settled"), и .focus() на них браузер молча игнорирует.
  requestAnimationFrame(() => {
    const items = focusableEls(box);
    if(items.length) items[0].focus();
  });

  return function cleanup(){
    box.removeEventListener('keydown', onKeydown);
    if(prevFocused && prevFocused.focus && document.contains(prevFocused)) prevFocused.focus();
  };
}

// Для модалок, которые открываются напрямую через
// modal.classList.add('active') из разных мест кода (а не через один
// Promise-based вызов, как confirm()/promptVaultPassphrase()) - например
// fp-modal (ui/fingerprint-modal.js:openFingerprintModal). Вызывается ОДИН
// раз при инициализации UI: ставит MutationObserver на class модалки и сам
// включает/выключает trapFocus при каждом добавлении/снятии 'active' -
// вызывающему коду не нужно ничего знать про focus trap.
export function autoTrapModal(modalId){
  const modal = document.getElementById(modalId);
  if(!modal) return;
  const box = modal.querySelector('.modal-box') || modal;
  let untrap = null;
  const sync = () => {
    const isActive = modal.classList.contains('active');
    if(isActive && !untrap){
      untrap = trapFocus(box, () => modal.classList.remove('active'));
    } else if(!isActive && untrap){
      untrap();
      untrap = null;
    }
  };
  new MutationObserver(sync).observe(modal, {attributes: true, attributeFilter: ['class']});
  sync(); // на случай, если модалка уже открыта в момент вызова
}
