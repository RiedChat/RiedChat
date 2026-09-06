// ===================== features/file-upload.js =====================
// Кнопка "прикрепить файл" - выбор из файловой системы (можно сразу несколько,
// до MAX_FILES штук) и отправка через uploadAndSend одно за другим.
import { $, toast } from '../core/dom-utils.js';
import { uploadAndSend } from '../net/upload.js';
import { uploadTransport } from '../net/upload/transport.js';
import { t } from '../i18n/t.js';
const MAX_FILES = 10;

export function wireFileUpload(){
    $('attach-btn').addEventListener('click', () => $('file-input').click());
    // Клик по прогресс-бару загрузки - отмена текущего файла (xhr.abort()).
    // Если в очереди ждут ещё файлы (см. file-upload.js цикл ниже или
    // net/upload.js:_uploadChain), они продолжат загружаться следом.
    $('upload-progress').addEventListener('click', () => uploadTransport.cancelCurrent());
    $('file-input').addEventListener('change', async (e) => {
      let files = Array.from(e.target.files || []);
      e.target.value = ''; // сбрасываем сразу, чтобы повторный выбор тех же файлов срабатывал

      if(files.length === 0) return;
      if(files.length > MAX_FILES){
        toast(t('files.tooMany', { max: MAX_FILES }));
        files = files.slice(0, MAX_FILES);
      }

      // Отправляем строго по одному: сервер загрузки выдаёт слот и прогресс-бар
      // в интерфейсе один на весь composer, поэтому параллельные PUT просто
      // затирали бы друг другу progress/label. Порядок в чате при этом
      // сохраняется таким же, каким файлы были выбраны.
      for(let i = 0; i < files.length; i++){
        const label = files.length > 1 ? `(${i + 1}/${files.length})` : '';
        await uploadAndSend(files[i], label);
      }
    });
}
