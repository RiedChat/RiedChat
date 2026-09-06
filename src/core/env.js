// ===================== core/env.js =====================
// Режим отладки (DEBUG): включается ТОЛЬКО через ?debug=1 (или debug=true /
// debug=yes) в адресной строке. Раньше значение ещё читалось из отдельного
// runtime-config.json на сервере - отдельный конфиг-файл ради единственного
// булева флага был избыточен: query-параметр работает без какой-либо
// серверной настройки, не требует деплоить лишний файл рядом с index.html
// и сразу виден в самой ссылке, если её нужно кому-то переслать для отладки.
//
// Импортируется первой же строкой в main.js: как ES-модуль запускается
// после парсинга документа, но раньше остального кода приложения - к тому
// моменту window.App.debugLog/_enableDebugUI (см. инлайн-скрипт в
// index.html) уже определены, потому что классические <script> в <head>
// выполняются синхронно во время парсинга, до старта модулей.

export let DEBUG = false;

// index.html содержит классический (не-модульный) инлайн-скрипт debugLog -
// туда нельзя сделать import, поэтому DEBUG дублируется в window.App.DEBUG
// как единственный канал связи с ним. Это мост к non-module коду, а не
// compat-заглушка для остальных ES-модулей (те импортируют DEBUG напрямую).
function syncDebugToInlineScript(){ window.App.DEBUG = DEBUG; }

try{
  const qs = new URLSearchParams(location.search);
  const qDebug = (qs.get('debug') || '').toLowerCase();
  if(qDebug === '1' || qDebug === 'true' || qDebug === 'yes'){
    DEBUG = true;
    syncDebugToInlineScript();
    console.log('[env] DEBUG включён через ?debug=1 в адресной строке.');
  }
}catch(e){ /* очень старый браузер без URLSearchParams - просто игнорируем, DEBUG остаётся false */ }

if(DEBUG && typeof window.App._enableDebugUI === 'function') window.App._enableDebugUI();
