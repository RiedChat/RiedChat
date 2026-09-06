// ============== ui/chat-view/video-poster/decoded-frame.js ==============
// Общий примитив: дождаться, что браузер РЕАЛЬНО декодировал и доставил
// хотя бы один кадр видео, и только тогда его читать. Используется и при
// постфактумном захвате кадра готового файла (capture.js - fallback для
// сообщений без встроенного превью), и при генерации превью для обычных
// видео на стороне отправителя (net/upload/video-thumb.js) - в обоих
// случаях нам не нужна ни перемотка, ни индекс кадров контейнера (Cues),
// а нужен просто честный "кадр, который точно есть на экране".
//
// requestVideoFrameCallback - специально созданный для этого API: он
// гарантирует вызов ПОСЛЕ того, как конкретный кадр реально дошёл до
// композитора (в отличие от 'seeked', который сообщает только о смене
// позиции плейбека, и от голого requestAnimationFrame, который этот
// момент лишь приблизительно угадывает). Поддерживается не везде - там,
// где нет, используем двойной requestAnimationFrame как запасной вариант.
export function onDecodedFrame(videoEl, cb){
  if(typeof videoEl.requestVideoFrameCallback === 'function'){
    videoEl.requestVideoFrameCallback(cb);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(cb));
  }
}
