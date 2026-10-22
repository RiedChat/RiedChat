// ===================== core/debug-log.js =====================
// ES-обёртка над window.App.debugLog, который определён classic-скриптом в index.html (classic-скрипты в <head>
// выполняются до модулей). Единственная точка обращения к мосту.
// DEBUG включается через ?debug=1 (или true/yes) в URL; дублируется в window.App.DEBUG: classic-скрипт не может импортировать модуль.
// main.js импортирует этот модуль первой строкой, чтобы флаг был выставлен до остального кода.
if(['1', 'true', 'yes'].includes((new URLSearchParams(location.search).get('debug') || '').toLowerCase())){
  window.App.DEBUG = true;
  window.App._enableDebugUI?.();
}

export const debugLog = (msg) => window.App?.debugLog?.(msg);

// Текст ошибки: e.message, а для не-Error (строка, DOMException без message) - само значение.
export const errMsg = (e) => e?.message || e;

// Выполняет fn; ошибка не пробрасывается, а пишется в debug-лог как '[tag] label: сообщение'. Возвращает результат fn, при ошибке - undefined.
export async function attempt(tag, label, fn){
  try{ return await fn(); }
  catch(e){ debugLog('[' + tag + '] ' + label + ': ' + errMsg(e)); }
}

// Описание DOMException getUserMedia: e.message часто пуст, причина в e.name (NotAllowedError, NotFoundError и т.п.).
export const domErrDetail = (e) =>
  [e?.name, e?.message].filter(Boolean).join(': ') || String(e ?? '');
