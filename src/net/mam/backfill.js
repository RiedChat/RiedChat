// ===================== net/mam/backfill.js =====================
// Два алгоритма постраничной выкачки MAM-архива. Не трогают S.messages/
// S.roster/историю на диске напрямую - applyPage(items) прокидывается
// снаружи (см. net/mam.js:syncAccount) и делает применение+дедуп+группировку
// по peer. Здесь - только логика "какие страницы и в каком порядке спросить".
import { queryMamPage } from './rsm-query.js';

// Догоняющая синхронизация: только то, что накопилось после lastId, пока
// клиент был оффлайн. Возвращает {newestSeenId}.
export async function catchUpSync(connection, lastId, applyPage){
  let after = lastId;
  let newestSeenId = lastId;
  let guard = 0;
  while(guard++ < 50){
    const page = await queryMamPage(connection, { after, max: 100 });
    await applyPage(page.items);
    if(page.last) newestSeenId = page.last;
    if(page.complete || page.items.length === 0) break;
    after = page.last || after;
  }
  return { newestSeenId };
}

// Первичная загрузка на новом устройстве: постранично назад с конца архива,
// максимум MAX_PAGES страниц, чтобы не залить разом весь возможный
// многолетний архив целиком. Возвращает {newestSeenId} (задаётся только
// самой свежей - первой прочитанной - страницей).
export async function initialBackfill(connection, applyPage){
  let before = '';
  let pages = 0;
  let newestSeenId = null;
  const MAX_PAGES = 4; // 4 × 100 = до 400 сообщений при первом входе
  while(pages < MAX_PAGES){
    const page = await queryMamPage(connection, { before, max: 100 });
    if(page.items.length === 0) break;
    await applyPage(page.items);
    if(pages === 0 && page.last) newestSeenId = page.last;
    if(!page.first || page.complete) break;
    before = page.first;
    pages++;
  }
  return { newestSeenId };
}
