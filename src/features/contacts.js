// ===================== features/contacts.js =====================
// Модалка "Добавить контакт".
import { $, wireModalDismiss, nickOf } from '../core/dom-utils.js';
import { state } from '../core/state.js';
import { addContact } from '../net/roster.js';

export function wireContacts(){
  const closeAddModal = wireModalDismiss('add-modal');
  $('add-contact-btn').addEventListener('click', () => $('add-modal').showModal());
  $('add-contact-confirm').addEventListener('click', () => {
    // Вводится только ник; если вставлен полный JID, берём часть до "@", чтобы не задвоить домен.
    const nick = nickOf($('new-contact-jid').value.trim());
    if(!nick) return;
    // Модалка доступна после логина, state.myBareJid заполнен: подставляем домен ТЕКУЩЕГО аккаунта.
    // Strophe.getDomainFromJid(myBareJid) отработает и на user@domain/resource.
    addContact(nick + '@' + Strophe.getDomainFromJid(state.myBareJid));
    closeAddModal();
    $('new-contact-jid').value = '';
  });
}
