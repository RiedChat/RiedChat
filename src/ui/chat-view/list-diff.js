// ===================== ui/chat-view/list-diff.js =====================
// Keyed-diff детей одного контейнера: переставляет/добавляет/удаляет только изменившееся.
// Узлы с прежним data-key не трогаются, поэтому плееры и observers внутри не перемонтируются.
// Однопроходная реконсиляция «подвинуть к курсору»: при стабильном порядке (дописывание в конец) - только вставки новых узлов; полная смена порядка - O(n) insertBefore.
//
// rows: [{key, build}] в нужном порядке.
//   key   - уникален в рамках вызова (см. buildWindowRows: msg:/day:/unread/downgrade: + префикс чата).
//   build - вызывается только для новых ключей, возвращает узел; data-key ставится здесь.
//
// Возвращает { mounted: Map<key, Node> (все узлы), created: Set<key> (только созданные - для них запускать догрузку медиа и обработчики) }.
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
    if(mounted.has(row.key)) continue; // дубль ключа в плане - пропускаем
    let node = existing.get(row.key);
    if(!node){
      node = row.build();
      node.dataset.key = row.key;
      created.add(row.key);
    }
    if(cursor !== node){
      // insertBefore работает и для нового узла, и для стоящего дальше в DOM (браузер переносит его одной операцией).
      container.insertBefore(node, cursor);
    } else {
      cursor = cursor.nextSibling;
    }
    mounted.set(row.key, node);
  }

  // Убираем всё, чего нет в новом плане (ушло за окно виртуализации, снята плашка «непрочитанные» и т.п.).
  for(const [key, node] of existing){
    if(!mounted.has(key)) node.remove();
  }

  return { mounted, created };
}
