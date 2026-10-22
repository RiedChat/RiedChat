// test/setup/libsignal.js
// Подключается через vitest.config.js -> test.setupFiles.
//
// 1) fake-indexeddb/auto - в jsdom нет IndexedDB, а crypto/idb-kv.js требует глобальный indexedDB.
import 'fake-indexeddb/auto';

// 2) public/js/crypto/libsignal-protocol.js - не ES-модуль, в проде classic <script> -> window.libsignal.
//    При ESM-import его UMD-обвязки находят require/module от vite-node и пытаются require('bytebuffer').
//    Поэтому выполняем через Function(...) с require/module/exports = undefined: UMD уходит в ветку "Global".
import { readFileSync } from 'node:fs';
import path from 'node:path';

// process.cwd(): vitest запускается из корня; import.meta.url в vite-node ненадёжен.
const libPath = path.resolve(process.cwd(), 'public/js/crypto/libsignal-protocol.js');
const code = readFileSync(libPath, 'utf8');
new Function('require', 'module', 'exports', code)(undefined, undefined, undefined);

if (!window.libsignal) {
  throw new Error('libsignal-protocol.js выполнился, но window.libsignal не заполнен');
}
globalThis.libsignal = window.libsignal;
