// ===================== ui/contact-view.js =====================
// Аватар контакта для шапки чата, ростера и экрана звонка.
import { initials } from '../core/dom-utils.js';
import { html } from '../core/safe-html.js';

// c.avatarUrl - недоверенный data:-URL из vCard (net/vcard.js), подставляется только через html`` (экранирует).
export const contactAvatarHtml = (c, jid) => c?.avatarUrl
  ? html`<img src="${c.avatarUrl}" alt="">`
  : html`${initials(jid)}`;
