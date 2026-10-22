// ===================== net/vcard-storage.js =====================
// Хранение (localStorage, на аккаунт) своего профиля и кэша профилей контактов. Протокол vCard - net/vcard.js.
import { accountValue, accountMap } from '../core/storage.js';

// ---------------- СВОЙ ПРОФИЛЬ (localStorage, на аккаунт) ----------------
// {nickname: string, photoB64: string|null, photoType: string|null, photoHash: string}
// photoHash хранится отдельно - не пересчитывать SHA-1 на каждую отправку presence.
export const profileStore = accountValue('xmppProfile');

// ---------------- КЭШ ПРОФИЛЕЙ КОНТАКТОВ (localStorage, на аккаунт) ----------------
export const contactNickStore = accountMap('xmppContactNick');
// {hash, dataUrl} по jid
export const contactAvatarStore = accountMap('xmppContactAvatar');
