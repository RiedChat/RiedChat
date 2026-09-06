// ===================== features/video-note.js =====================
// Публичная точка входа кружков (видео-сообщений). Реализация разбита по
// смыслу на features/video-note/*: state.js (общее состояние), canvas.js
// (круглая отрисовка кадра), camera.js (поток/переключение камеры),
// recording.js (запуск/остановка записи), preview.js (отправка/отмена),
// ui.js (модалка и разводка кнопок). Наружу отдаём только то, что
// используется за пределами модуля: startVideoNoteRecording дергается из
// voice-recorder.js по короткому тапу, wireVideoNote - из app.js при старте.
export { startVideoNoteRecording } from './video-note/recording.js';
export { wireVideoNote } from './video-note/ui.js';
