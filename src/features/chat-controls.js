// ===================== features/chat-controls.js =====================
// Разные мелкие элементы управления зоной чата: кнопка "назад" на мобильном,
// поиск по ростеру, очистка истории, переключатель OMEMO и открытие/закрытие
// модалки отпечатков.
import { $, toast, wireModalDismiss } from '../core/dom-utils.js';
import { persistLastScreen } from '../core/last-seen-storage.js';
import { html, raw, setHTML } from '../core/safe-html.js';
import { omemo } from '../crypto/omemo/state.js';
import { openFingerprintModal } from '../ui/fingerprint-modal.js';
import { updateOmemoBadge } from '../ui/chat-head.js';
import { clearActiveChat, logout } from '../ui/modals.js';
import { t } from '../i18n/t.js';
import { ICON_LOCK_CLOSED, ICON_LOCK_OPEN } from '../core/icons.js';

// Иконка кнопки-переключателя привязана к тому, ЧТО кнопка предлагает
// сделать (а не к текущему состоянию, как у бейджа рядом): "Выключить" -
// открытый замок, "Включить" - закрытый.
function renderOmemoToggle(){
  const btn = $('omemo-toggle');
  const icon = omemo.enabled ? ICON_LOCK_OPEN : ICON_LOCK_CLOSED;
  const label = omemo.enabled ? t('chatControls.omemoOffBtn') : t('chatControls.omemoOnBtn');
  setHTML(btn, html`${raw(icon)} ${label}`);
  btn.title = omemo.enabled ? t('chatControls.omemoOnTitle') : t('chatControls.omemoOffTitle');
}

export function wireChatControls(){
    // ---- mobile back ----
    $('back-btn').addEventListener('click', () => {
      $('app').classList.remove('mobile-chat-open');
      persistLastScreen('contacts'); // вернулись в список контактов - запоминаем на случай следующего входа
    });

    // ---- очистка истории текущего чата ----
    $('clear-chat-btn').addEventListener('click', () => clearActiveChat());

    // ---- выход из аккаунта ----
    $('logout-btn').addEventListener('click', () => logout());

    // ---- search ----
    $('roster-search').addEventListener('input', function(){
      const q = this.value.toLowerCase();
      document.querySelectorAll('.roster-item').forEach(el => {
        const name = el.querySelector('.roster-name').textContent.toLowerCase();
        el.style.display = name.includes(q) ? 'flex' : 'none';
      });
    });

    // ---- OMEMO badge / fingerprints modal ----
    $('omemo-badge').addEventListener('click', () => openFingerprintModal());
    wireModalDismiss('fp-modal', 'fp-modal-close');
    renderOmemoToggle();
    $('omemo-toggle').addEventListener('click', () => {
      omemo.enabled = !omemo.enabled;
      renderOmemoToggle();
      updateOmemoBadge();
      toast(omemo.enabled ? t('chatControls.omemoOnToast') : t('chatControls.omemoOffToast'));
    });

    // ---- меню чата "⋮" (поиск / OMEMO / очистка истории - собраны в одном месте рядом с ником) ----
    const menuBtn = $('chat-menu-btn');
    const menuDropdown = $('chat-menu-dropdown');
    const closeMenu = () => menuDropdown.classList.remove('open');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menuDropdown.classList.toggle('open');
    });
    // Любой клик по пункту меню (поиск/бейдж/тумблер/очистка - у каждого свой
    // обработчик выше или в других файлах) должен так же закрывать выпадашку -
    // проще всего сделать это одним делегированным слушателем на самом меню,
    // который сработает уже ПОСЛЕ обработчика конкретной кнопки (bubbling).
    menuDropdown.addEventListener('click', closeMenu);
    document.addEventListener('click', (e) => {
      if(menuDropdown.classList.contains('open') && !menuDropdown.contains(e.target) && e.target !== menuBtn) closeMenu();
    });
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeMenu(); });
}
