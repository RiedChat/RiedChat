// ===================== features/contacts.js =====================
// Модалка "Добавить контакт".
import { $, wireModalDismiss } from '../core/dom-utils.js';
import { addContact } from '../net/roster.js';
import { state } from '../core/state.js';

export function wireContacts(){
    const closeAddModal = wireModalDismiss('add-modal');
    $('add-contact-btn').addEventListener('click', () => $('add-modal').classList.add('active'));
    $('add-contact-confirm').addEventListener('click', () => {
      const raw = $('new-contact-jid').value.trim();
      if(!raw) return;
      // Пользователь вводит только ник - если он всё же вставил полный JID
      // (с "@domain"), берём только часть до "@", чтобы не задвоить домен.
      const nick = raw.split('@')[0];
      if(!nick) return;
      // Модалка доступна только внутри уже открытого приложения (после
      // логина), поэтому state.myBareJid к этому моменту всегда заполнен -
      // подставляем контакту домен ТЕКУЩЕГО аккаунта, а не хардкод.
      // Strophe.getDomainFromJid(myBareJid) корректно отработает и на
      // JID вида user@domain/resource, если resource где-то просочится.
      const domain = Strophe.getDomainFromJid(state.myBareJid);
      const jid = nick + '@' + domain;
      addContact(jid);
      closeAddModal();
      $('new-contact-jid').value = '';
    });
}
