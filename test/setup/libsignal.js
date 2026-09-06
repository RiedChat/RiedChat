// test/setup/libsignal.js
// Подключается через vitest.config.js -> test.setupFiles.
//
// 1) fake-indexeddb/auto - jsdom не реализует IndexedDB, а crypto/idb-kv.js
//    (через core/storage.js:openIndexedDb) полагается на глобальный indexedDB.
import 'fake-indexeddb/auto';

// 2) public/js/crypto/libsignal-protocol.js - generated emscripten-бандл (см.
//    README.md), в проде подключается как classic <script> и кладёт себя в
//    window.libsignal. Это не ES-модуль (нет import/export) и внутри есть
//    UMD-обвязки (long.js/bytebuffer.js/protobuf.js), которые сами детектят
//    CommonJS через `typeof require === 'function'` - если импортировать файл
//    напрямую через ESM-import, vite-node подсовывает свой настоящий
//    require/module, и UMD пытается реально require('bytebuffer') (пакета
//    нет и не нужен, он же встроен в этот файл ниже по UMD-цепочке).
//    Поэтому выполняем файл через Function(...) с require/module/exports,
//    явно занулёнными как параметры - это уводит все UMD-проверки в ветку
//    "Global" (как в настоящем <script> в браузере), а сам libsignal
//    самодостаточен (memoryInitializer внутри == null - внешних .wasm/.mem
//    не грузит).
import { readFileSync } from 'node:fs';
import path from 'node:path';

// process.cwd() - vitest всегда запускается из корня проекта (см. package.json
// scripts); import.meta.url тут ненадёжен, т.к. vite-node может отдавать его
// не как file://-URL.
const libPath = path.resolve(process.cwd(), 'public/js/crypto/libsignal-protocol.js');
const code = readFileSync(libPath, 'utf8');
new Function('require', 'module', 'exports', code)(undefined, undefined, undefined);

if (!window.libsignal) {
  throw new Error('libsignal-protocol.js выполнился, но window.libsignal не заполнен');
}
globalThis.libsignal = window.libsignal;
