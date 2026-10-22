// ===================== core/pending-image.js =====================
// Несохранённый выбор картинки в модалке профиля (аватар, обои): новая или "удалить", применяется по "Сохранить".
// previewFn(b64, type) перерисовывает превью; (null, null) - картинки нет.
import { t } from '../i18n/t.js';

import { errMsg } from './debug-log.js';
import { $, toast, wireFilePicker } from './dom-utils.js';

export function createPendingImage({ previewFn }){
  let pending; // undefined - не менялось, null - удалить, {b64, type} - новая
  return {
    // b64 - часть dataUrl после запятой.
    set(dataUrl, type){
      pending = { b64: String(dataUrl).split(',')[1], type };
      previewFn(pending.b64, type);
    },
    remove(){
      pending = null;
      previewFn(null, null);
    },
    // Сброс без перерисовки, при каждом открытии модалки.
    reset(){
      pending = undefined;
    },
    // Итог: удалено -> null, новая -> {b64, type}, иначе current.
    resolve(current){
      return pending === undefined ? current : pending;
    },
  };
}

// Вешает выбор файла и кнопку "удалить" на pending. process(file) -> [dataUrl, type] либо null (отклонён, причину
// показывает сам). needImageKey/errorKey - i18n-ключи тостов (errorKey с {error}).
export function wirePendingImagePicker({ pickId, inputId, removeId, pending, process, needImageKey, errorKey }){
  wireFilePicker(pickId, inputId, async (files) => {
    const file = files[0];
    if(!file.type.startsWith('image/')){
      toast(t(needImageKey));
      return;
    }
    try{
      const picked = await process(file);
      if(picked) pending.set(picked[0], picked[1]);
    }catch(err){
      toast(t(errorKey, { error: errMsg(err) }));
    }
  });
  $(removeId).addEventListener('click', () => pending.remove());
}
