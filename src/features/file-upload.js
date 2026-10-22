// ===================== features/file-upload.js =====================
// Кнопка "прикрепить файл": выбор нескольких файлов (до MAX_FILES), отправка через uploadAndSend по одному.
import { $, toast, wireFilePicker } from '../core/dom-utils.js';
import { t } from '../i18n/t.js';
import { cancelUpload } from '../net/upload/transport.js';
import { uploadAndSend } from '../net/upload.js';
const MAX_FILES = 10;

export function wireFileUpload(){
  // Клик по прогресс-бару отменяет текущий файл (xhr.abort()); остальные в очереди (цикл ниже, net/upload.js:_uploadChain) продолжают.
  $('upload-progress').addEventListener('click', () => cancelUpload());
  wireFilePicker('attach-btn', 'file-input', async (files) => {
    const batch = files.slice(0, MAX_FILES);
    if(batch.length < files.length) toast(t('files.tooMany', { max: MAX_FILES }));

    // Строго по одному: слот и прогресс-бар общие на весь composer, параллельные PUT затирали бы progress/label; порядок в чате сохраняется.
    for(const [i, file] of batch.entries()){
      await uploadAndSend(file, batch.length > 1 ? `(${i + 1}/${batch.length})` : '');
    }
  });
}
