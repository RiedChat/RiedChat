// ========= features/message-edit/two-finger.js =========
// На тачскрине - тап ДВУМЯ пальцами одновременно по пузырю (в любом месте
// внутри него, включая сам текст сообщения) запускает редактирование.
//
// БАГ (исправлено): раньше редактирование на телефоне запускалось только
// двумя ОБЫЧНЫМИ тапами подряд (через click-события, см. click-triggers.js)
// - а тап именно по тексту сообщения (не по пустому месту пузыря) браузер на
// тачскрине нередко трактует как жест выделения слова/текста ("выделить по
// двойному тапу"), и второй click просто не долетает до обработчика: править
// сообщение можно было, только попадая пальцем мимо текста. Тап ДВУМЯ
// пальцами одновременно с обычным выделением текста не конкурирует и всегда
// доходит как pointerdown/up - работает по всей площади пузыря, включая сам
// текст.
//
// Логика: считаем "сессией" промежуток от первого пальца, коснувшегося
// строки сообщения, до момента, когда все пальцы этой сессии отпущены.
// Срабатывает, только если за сессию единовременно (peak) было РОВНО два
// касания, все они были короткими (уложились в DOUBLE_TAP_MS суммарно) и ни
// одно не сдвинулось дальше TWO_FINGER_MOVE_TOLERANCE (иначе это уже
// свайп/скролл/pinch-zoom, а не тап).
import { msgByRow, startEdit, DOUBLE_TAP_MS } from './core.js';

const TWO_FINGER_MOVE_TOLERANCE = 14; // px

export function wireTwoFingerEdit(container){
  let session = null; // {row, bubble, t0, touches: Map(pointerId -> {x0,y0}), peak, invalid}

  container.addEventListener('pointerdown', (e) => {
    if(e.pointerType !== 'touch') return;
    const row = e.target.closest('.msg-row');
    if(!row){
      if(session) session.invalid = true; // палец мимо сообщений - жест не наш
      return;
    }
    if(!session || session.touches.size === 0){
      session = { row, bubble: row.querySelector('.bubble'), t0: Date.now(), touches: new Map(), peak: 0, invalid: false };
    } else if(session.row !== row){
      session.invalid = true; // второй палец попал в другое сообщение
    }
    session.touches.set(e.pointerId, { x0: e.clientX, y0: e.clientY });
    session.peak = Math.max(session.peak, session.touches.size);
    if(session.peak > 2) session.invalid = true; // третий и более палец - уже не двупальцевый тап
  }, {passive:true});

  container.addEventListener('pointermove', (e) => {
    if(!session) return;
    const t = session.touches.get(e.pointerId);
    if(!t) return;
    if(Math.abs(e.clientX - t.x0) > TWO_FINGER_MOVE_TOLERANCE || Math.abs(e.clientY - t.y0) > TWO_FINGER_MOVE_TOLERANCE){
      session.invalid = true; // палец поехал - это уже не тап
    }
  }, {passive:true});

  function onUp(e){
    if(!session || !session.touches.has(e.pointerId)) return;
    session.touches.delete(e.pointerId);
    if(session.touches.size > 0) return; // ждём, пока отпустят все пальцы сессии
    const s = session;
    session = null;
    if(s.invalid || s.peak !== 2) return;
    if(Date.now() - s.t0 > DOUBLE_TAP_MS) return;
    const msg = msgByRow(s.row);
    if(!msg || !s.bubble) return;
    startEdit(msg, s.bubble);
  }
  container.addEventListener('pointerup', onUp);
  container.addEventListener('pointercancel', onUp);
}
