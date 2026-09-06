// ===================== core/debug-log.js =====================
// Тонкая ES-обёртка над window.App.debugLog. Сам debugLog определён
// classic-скриптом в index.html (см. комментарий в core/env.js - он должен
// существовать ДО старта модулей, поэтому не может быть ES-экспортом сам
// по себе). Этот модуль - единственная точка, через которую остальной код
// обращается к мосту, чтобы вызовы debugLog(...) сами по себе не тянули за
// собой прямых обращений к window.App по всему проекту.
export function debugLog(msg){
  if(typeof window.App !== 'undefined' && typeof window.App.debugLog === 'function'){
    window.App.debugLog(msg);
  }
}
