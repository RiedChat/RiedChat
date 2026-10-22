// ===================== core/iq.js =====================
// Promise-обёртка над Strophe sendIQ: резолвится ответной станзой, при ошибке сервера reject с error-станзой, при таймауте - с null.
import { t } from '../i18n/t.js';

import { IQ_TIMEOUT_MS } from './constants.js';
import { state } from './state.js';

// Таймаут обязателен: без него sendIQ может зависнуть навсегда.
export const sendIqAsync = (iq, timeout = IQ_TIMEOUT_MS, connection = state.connection) =>
  new Promise((resolve, reject) => connection.sendIQ(iq, resolve, reject, timeout));

// Как sendIqAsync, но любая ошибка (error-станза, таймаут, обрыв) -> null. Для вызовов, которым причина не нужна.
export const sendIqSafe = (...args) => sendIqAsync(...args).catch(() => null);

// Условия <error/> через запятую (напр. "conflict,text"); errStanza === null - таймаут/нет ответа.
export const iqErrorCondition = (errStanza) => {
  const cond = errStanza?.querySelector('error');
  return cond ? Array.from(cond.children).map(c => c.tagName).join(',') : t('omemo.pepNoResponse');
};
