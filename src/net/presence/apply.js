// =================== net/presence/apply.js ===================
// Применение разобранных данных presence-станзы к state (ник, аватар,
// онлайн/офлайн по ресурсам). Выделено из net/presence/incoming.js.
import { persistLastSeen } from '../../core/last-seen-storage.js';
import { state } from '../../core/state.js';
import { persistContactNick, loadContactAvatarMeta, clearContactAvatar } from '../vcard-storage.js';
import { refreshContactAvatar } from '../vcard.js';

const S = state;

export function applyNick(bare, nick){
  if(nick && S.roster[bare].nick !== nick){
    S.roster[bare].nick = nick;
    persistContactNick(bare, nick);
  }
}

export function applyVcardHash(bare, hash){
  if(hash === ''){
    if(S.roster[bare].avatarUrl){ S.roster[bare].avatarUrl = null; clearContactAvatar(bare); }
    return;
  }
  const cached = loadContactAvatarMeta(bare);
  if(cached && cached.hash === hash){
    if(!S.roster[bare].avatarUrl) S.roster[bare].avatarUrl = cached.dataUrl;
  } else {
    refreshContactAvatar(bare, hash); // асинхронно - сама перерисует ростер/шапку по готовности
  }
}

// Presence в XMPP приходит ПО РЕСУРСАМ (устройство/клиент), а не одной
// штукой на весь bare JID: у собеседника может быть открыто несколько
// сессий одновременно (телефон + браузер и т.п.), и каждая шлёт свой
// available/unavailable независимо. Держим набор фактически online-ресурсов
// и считаем контакт офлайн (и фиксируем lastSeen) только когда из этого
// набора исчезает последний ресурс.
export function applyResourceUpdate(bare, resource, type){
  const contact = S.roster[bare];
  const onlineResources = contact.onlineResources || (contact.onlineResources = new Set());
  const wasOnline = onlineResources.size > 0;

  if(type === 'unavailable'){
    if(resource) onlineResources.delete(resource);
    else onlineResources.clear(); // presence без ресурса - трактуем как "выключить всё"
    if(contact.resource === resource) contact.resource = null;
    const stillOnline = onlineResources.size > 0;
    contact.presence = stillOnline ? 'online' : 'offline';
    // Обновляем lastSeen ТОЛЬКО если контакт реально был online и теперь
    // ушли ВСЕ его ресурсы (а не просто один из нескольких) у нас на
    // глазах - иначе, например, после переподключения затирали бы уже
    // сохранённое верное время текущим моментом.
    if(wasOnline && !stillOnline){
      contact.lastSeen = Date.now();
      persistLastSeen(bare, contact.lastSeen);
    }
  } else {
    if(resource) onlineResources.add(resource);
    contact.presence = 'online';
    if(resource) contact.resource = resource;
  }
}
