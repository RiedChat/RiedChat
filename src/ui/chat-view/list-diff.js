// ===================== ui/chat-view/list-diff.js =====================
// Небольшой keyed-diff для ДЕТЕЙ ОДНОГО контейнера: вместо el.innerHTML=''+
// пересборки всего списка на каждое изменение (renderMessages() раньше
// делал именно так - см. riedchat-perf-notes.md, п.1), сверяет новый
// порядок ключей (data-key) с уже стоящими в DOM узлами и переставляет/
// добавляет/удаляет только то, что реально изменилось. Узлы, чей ключ
// остался на месте, вообще не трогаются - а значит voice/video-плееры,
// IntersectionObserver и т.п. ВНУТРИ них не перемонтируются и не теряют
// состояние (это и было главной жалобой в riedchat-perf-notes.md).
//
// Алгоритм - однопроходная реконсиляция "подвинуть-к-курсору" (как в
// маленьких vdom-подобных библиотеках, без полноценного LIS-move-minimize):
// для уже стабильного порядка (самый частый случай - сообщения дописываются
// в конец, ничего не переставляется) не делает НИ ОДНОЙ DOM-операции сверх
// необходимых вставок новых узлов. Полная смена порядка (редкий случай -
// см. sortedByTime в render-messages.js) деградирует до O(n) insertBefore,
// что всё ещё намного дешевле полного уничтожения+пересоздания DOM.
//
// rows: массив {key, build} в НУЖНОМ порядке.
//   key   - строка, уникальная в пределах ЭТОГО вызова (см. render-messages.js:
//           buildRowPlan - ключи вида 'msg:<idx>'/'day:<день>'/'unread'/'downgrade:<idx>',
//           плюс сам активный чат в префиксе, чтобы при переключении чата
//           старые строки не переиспользовались по случайному совпадению idx).
//   build - вызывается ТОЛЬКО для новых ключей (узел ещё не стоит в DOM с
//           таким data-key) и должен вернуть готовый DOM-узел; data-key
//           проставляется этой функцией сама, build() может его не задавать.
//
// Возвращает { mounted: Map<key, Node>, created: Set<key> } - mounted
// содержит ВСЕ узлы после реконсиляции (и переиспользованные, и новые),
// created - только что реально созданные (по ним вызывающий код запускает
// догрузку медиа/навешивает обработчики - для переиспользованных узлов
// этого делать не нужно, они уже настроены с прошлого раза).
export function reconcileKeyedChildren(container, rows){
  const existing = new Map();
  for(const child of container.children){
    const key = child.dataset ? child.dataset.key : null;
    if(key) existing.set(key, child);
  }

  const mounted = new Map();
  const created = new Set();
  let cursor = container.firstChild;

  for(const row of rows){
    if(mounted.has(row.key)) continue; // защита от случайно задвоенного ключа в плане - не роняем реконсиляцию
    let node = existing.get(row.key);
    if(!node){
      node = row.build();
      node.dataset.key = row.key;
      created.add(row.key);
    }
    if(cursor !== node){
      // insertBefore одинаково корректно работает и для совсем нового узла
      // (просто вставляет перед курсором), и для узла, уже стоящего где-то
      // ДАЛЬШЕ в DOM (браузер сам переносит его на новое место одной
      // операцией - лишний remove()+повторный insert не нужен).
      container.insertBefore(node, cursor);
    } else {
      cursor = cursor.nextSibling;
    }
    mounted.set(row.key, node);
  }

  // Всё, что было в DOM, но не встретилось в новом плане (сообщение ушло
  // за буфер виртуализации ниже/выше, плашка "непрочитанные" снята после
  // прочтения и т.п.) - убираем.
  for(const [key, node] of existing){
    if(!mounted.has(key)) node.remove();
  }

  return { mounted, created };
}
