// ===================== features/chat-controls.js =====================
// Мелкие элементы управления чатом: "назад" на мобильном, поиск по ростеру, очистка истории, модалка отпечатков.
import { $, wireModalDismiss } from '../core/dom-utils.js';
import { persistLastScreen } from '../core/last-seen-storage.js';
import { openFingerprintModal } from '../ui/fingerprint-modal.js';
import { clearActiveChat, logout } from '../ui/modals.js';

export function wireChatControls(){
    // ---- mobile back ----
    $('back-btn').addEventListener('click', () => {
      $('app').classList.remove('mobile-chat-open');
      persistLastScreen(); // запоминаем экран на случай следующего входа
    });

    // ---- очистка истории текущего чата ----
    $('clear-chat-btn').addEventListener('click', clearActiveChat);

    // ---- выход из аккаунта ----
    $('logout-btn').addEventListener('click', logout);

    // ---- search ----
    $('roster-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.roster-item').forEach(el => {
        el.hidden = !el.querySelector('.roster-name').textContent.toLowerCase().includes(q);
      });
    });

    // ---- OMEMO badge / fingerprints modal ----
    $('omemo-badge').addEventListener('click', openFingerprintModal);
    wireModalDismiss('fp-modal', 'fp-modal-close');

    // ---- меню чата "⋮" (поиск / отпечатки OMEMO / очистка истории) ----
    const menuBtn = $('chat-menu-btn');
    const menuDropdown = $('chat-menu-dropdown');
    const closeMenu = () => menuDropdown.classList.remove('open');
    // Клик вне кнопки меню закрывает выпадашку, в т.ч. по пункту (его обработчик срабатывает раньше, это - при всплытии).
    menuBtn.addEventListener('click', () => menuDropdown.classList.toggle('open'));
    document.addEventListener('click', (e) => { if(!menuBtn.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeMenu(); });
}
