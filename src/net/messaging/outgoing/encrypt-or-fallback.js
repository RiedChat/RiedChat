// ===================== net/messaging/outgoing/encrypt-or-fallback.js =====================
// Общая для sendMessage и editMessage логика: пробует зашифровать тело
// сообщения через OMEMO, а если не вышло - запрашивает у пользователя
// блокирующее подтверждение на отправку открытым текстом (см.
// riedchat-security-plan.md, п.1). Без явного согласия сообщение никуда не
// уходит - вызывающий код должен вернуть {sent:false} и не трогать ни поле
// ввода, ни локальную историю.
//
// Решение пользователя запоминается на сессию/чат в
// S.plaintextFallbackDecision, чтобы не спрашивать на каждое сообщение
// подряд - но НЕ становится тихим дефолтом: первый раз для каждого чата
// всегда спрашиваем явно, и отказ ('block') тоже запоминается, а не
// переспрашивается.
import { state } from '../../../core/state.js';
import { confirm as confirmModal } from '../../../ui/modals.js';
import { omemo } from '../../../crypto/omemo/state.js';
import { t } from '../../../i18n/t.js';

const S = state;

// actionText: 'Сообщение' | 'Исправление' - подставляется в текст подтверждения.
// Возвращает {blocked, encryptedEl, fallbackReason}.
// blocked=true означает, что отправлять нельзя (пользователь отказался, или
// раньше уже отказывался в этом чате) - вызывающий код должен прервать отправку.
export async function encryptOrFallback(toJid, body, actionText){
  const useOmemo = omemo.enabled && omemo.ready;
  let encryptedEl = null;
  if(useOmemo){
    try{ encryptedEl = await omemo.encryptFor(toJid, body); }
    catch(e){ console.warn('OMEMO encrypt failed', e); }
  }

  if(encryptedEl || !useOmemo){
    return { blocked:false, encryptedEl, fallbackReason:null };
  }

  const fallbackReason = omemo.lastEncryptFailReason === 'all-devices-dead' ? 'all-devices-dead' : 'no-devices';

  // body вида aesgcm://...#<hex ключа+IV> - это не текст сообщения, а
  // ключ дешифрования уже загруженного вложения (см. net/upload/encrypt.js:
  // buildAesgcmLink). Уйдя открытым текстом, он сводит на нет OMEMO-шифрование
  // самого файла (сервер/MITM получит и ссылку, и ключ разом) - поэтому для
  // такого body НЕЛЬЗЯ переиспользовать ранее сохранённое для чата решение
  // 'allow' (оно давалось для обычного текста, а не для ключа) и нужен
  // отдельный, более жёсткий текст предупреждения.
  const isAttachmentKey = /^aesgcm:\/\//i.test(body);
  const decision = isAttachmentKey ? null : S.plaintextFallbackDecision[toJid];
  if(decision === 'allow') return { blocked:false, encryptedEl:null, fallbackReason };
  if(decision === 'block') return { blocked:true, encryptedEl:null, fallbackReason };

  const reasonText = fallbackReason === 'all-devices-dead'
    ? t('messaging.reasonAllDevicesDead')
    : t('messaging.reasonNoDevices');
  const bodyText = isAttachmentKey
    ? t('messaging.attachmentKeyWarning', {reason: reasonText})
    : t('messaging.plaintextWarning', {reason: reasonText, action: actionText});
  const ok = await confirmModal(
    t('messaging.confirmTitle'),
    bodyText,
    { okText: t('messaging.confirmOk'), cancelText: t('messaging.confirmCancel'), okDanger: false }
  );
  if(!isAttachmentKey) S.plaintextFallbackDecision[toJid] = ok ? 'allow' : 'block';
  return { blocked: !ok, encryptedEl:null, fallbackReason };
}
