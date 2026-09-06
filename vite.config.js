import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

// ANALYZE=1 npm run build - сгенерировать dist/stats.html с составом бандла
// (по gzip-размеру). В обычной сборке плагин не подключается, чтобы не
// тратить время на анализ там, где он не нужен.
const analyze = !!process.env.ANALYZE;

export default defineConfig({
  // Относительные пути в собранном бандле - деплой в любую подпапку без правки.
  base: './',
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // js/crypto/libsignal-protocol.js (36k строк, generated) специально НЕ
    // проходит через сборщик - лежит в public/ как есть, см. README.md.
    sourcemap: true,
    // Явно фиксируем таргет вместо дефолтного ('modules', эквивалент старого
    // es2019+baseline-modules-support) - проект использует top-level await
    // нигде, но полагается на нативные ES-модули/динамический import() без
    // полифиллов (см. worker.format:'es' ниже), поэтому фиксируем актуальный
    // baseline явно, а не полагаемся на то, что дефолт Vite не сменится.
    target: 'es2022',
    // Бюджет размера чанка: дефолтные 500 KB не поймали бы разрастание
    // main-чанка после того, как из него вынесли call/stickers/video-note -
    // 300 KB (raw, до gzip) держит его под контролем на будущее; для
    // конкретно libsignal-протокола предупреждение не актуально, он не
    // проходит через сборщик (см. комментарий про public/ выше).
    chunkSizeWarningLimit: 300,
    // CSS Code Splitting не нужен: весь css/*.css импортируется только из
    // одной точки входа (src/main.js), поэтому Vite и так соберёт один
    // общий output.css - оставлено дефолтным (true), поведение не меняет.
  },
  plugins: [
    analyze && visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  worker: {
    // net/media-worker/media-worker.js - module worker (см.
    // src/net/media/worker-client.js): собирается Vite как ES-модуль,
    // а не как classic-iife-скрипт по умолчанию.
    format: 'es',
  },
});
