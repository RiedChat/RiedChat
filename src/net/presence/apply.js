// =================== net/presence/apply.js ===================
// Применение разобранного presence к state (ник, аватар, онлайн/офлайн по ресурсам). Из net/presence/incoming.js.
import { lastSeenStore } from '../../core/last-seen-storage.js';
import { state } from '../../core/state.js';
import { contactNickStore, contactAvatarStore } from '../vcard-storage.js';
import { refreshContactAvatar } from '../vcard.js';

export function applyNick(bare, nick){
  if(nick && state.roster[bare].nick !== nick){
    state.roster[bare].nick = nick;
    contactNickStore.set(bare, nick);
  }
}

export function applyVcardHash(bare, hash){
  if(hash === ''){
    if(state.roster[bare].avatarUrl){ state.roster[bare].avatarUrl = null; contactAvatarStore.delete(bare); }
    return;
  }
  const cached = contactAvatarStore.all()[bare];
  if(cached && cached.hash === hash){
    if(!state.roster[bare].avatarUrl) state.roster[bare].avatarUrl = cached.dataUrl;
  } else {
    refreshContactAvatar(bare, hash);  // асинхронно - сама перерисует ростер/шапку
  }
}

// Presence приходит ПО РЕСУРСАМ: у контакта может быть несколько сессий, каждая шлёт свой
// available/unavailable. Держим набор online-ресурсов; контакт офлайн (и фиксируется lastSeen)
// только когда исчез последний.
export function applyResourceUpdate(bare, resource, type){
  const contact = state.roster[bare];
  const onlineResources = contact.onlineResources || (contact.onlineResources = new Set());
  const wasOnline = onlineResources.size > 0;

  if(type === 'unavailable'){
    if(resource) onlineResources.delete(resource);
    else onlineResources.clear();  // presence без ресурса - "выключить всё"
    if(contact.resource === resource) contact.resource = null;
    const stillOnline = onlineResources.size > 0;
    contact.presence = stillOnline ? 'online' : 'offline';
    // lastSeen обновляем только если контакт был online и у нас на глазах ушли ВСЕ ресурсы -
    // иначе после переподключения затирали бы верное время текущим.
    if(wasOnline && !stillOnline){
      contact.lastSeen = Date.now();
      lastSeenStore.set(bare, contact.lastSeen);
    }
  } else {
    if(resource) onlineResources.add(resource);
    contact.presence = 'online';
    if(resource) contact.resource = resource;
  }
}
