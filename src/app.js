// ===================== app.js =====================
// Точка входа: открытие чата и запуск всех обработчиков событий,
// которые определены в js/features/*.js.
import { persistLastScreen } from './core/last-seen-storage.js';
import { state } from './core/state.js';
import { $ } from './core/dom-utils.js';
import { wireFontSettings } from './features/font-settings/wire.js';
import { omemo } from './crypto/omemo/state.js';
import { wireLogin } from './features/login.js';
import { wireComposer } from './features/composer.js';
import { wireFileUpload } from './features/file-upload.js';
import { wireContacts } from './features/contacts.js';
import { wireChatControls } from './features/chat-controls.js';
import { wireMediaViewer } from './features/media-viewer.js';
import { wireMessageSearch } from './features/message-search.js';
import { wireViewport } from './features/viewport.js';
import { wireProfile } from './features/profile.js';
import { wireThemeSettings } from './features/theme-settings.js';
import { wireMessageSwipe } from './features/message-swipe.js';
import { wireMessageEdit } from './features/message-edit.js';
import { wireMessageSelect } from './features/message-select.js';
import { wireQuoteJump } from './features/quote-jump.js';
import { wireVoiceRecorder } from './features/voice-recorder.js';
import { renderChatHead, updateOmemoBadge, renderReplyBar, renderCallBanner } from './ui/chat-head.js';
import { renderMessages } from './ui/chat-view/render-messages.js';
import { _markChatRead } from './ui/chat-view/unread-tracking.js';
import { renderRoster } from './ui/roster.js';
import { wireResilience } from './net/connection/resilience.js';
import { checkSecurityWarnings } from './ui/security-warnings.js';

const S = state;

export function openChat(jid){
  S.activeChat = jid;
  S.replyTo = null; // цитата привязана к конкретному чату - при переключении сбрасываем
  S.editing = null; // как и редактирование - нельзя редактировать сообщение из чужого чата
  persistLastScreen('chat', jid); // запоминаем, чтобы при следующем входе открыть тот же чат
  $('empty-state').style.display = 'none';
  $('conversation').style.display = 'flex';
  renderChatHead();
  renderMessages();
  renderReplyBar();
  renderCallBanner();
  // Пользователь только что открыл чат и увидел его содержимое (включая
  // плашку "Непрочитанные сообщения", если она есть) - этого достаточно,
  // чтобы считать сообщения прочитанными, не дожидаясь скролла мимо плашки
  // (см. _watchUnreadDivider). Так бейдж счётчика в ростере пропадает сразу
  // при открытии чата и не возвращается после перезагрузки страницы или
  // выхода назад в меню, даже если пользователь не долистал до конца.
  _markChatRead(jid);
  renderRoster();
  $('app').classList.add('mobile-chat-open');
  omemo.getDeviceList(jid).then(() => updateOmemoBadge());
  if(window.innerWidth > 768) $('msg-input').focus();
  // Показываем накопленные крипто-предупреждения по этому контакту (смена
  // identity-ключа / новое устройство), если они есть и ещё не показывались.
  checkSecurityWarnings(jid);
}

// Вызывается из Android (MainActivity.onBackPressed через evaluateJavascript)
// при нажатии системной кнопки "назад". Возвращает true, если экран сам
// обработал нажатие (закрыл модалку/чат), и Android не должен закрывать
// Activity. Возвращает false, если обрабатывать нечего - тогда на стороне
// Android либо выполнится webView.goBack(), либо приложение свернётся/закроется.
function handleAndroidBack(){
  const openModal = document.querySelector('.modal-overlay.active');
  if(openModal){
    openModal.classList.remove('active');
    return true;
  }
  if($('app').classList.contains('mobile-chat-open')){
    $('back-btn').click();
    return true;
  }
  return false;
}
window.__androidHandleBack = handleAndroidBack;

function wireEvents(){
  wireResilience();
  wireViewport();
  wireLogin();
  wireComposer();
  wireFileUpload();
  wireVoiceRecorder();
  // Звонки/кружки/стикеры - самые тяжёлые фичи (WebRTC-стек, canvas-запись
  // видео, панель со сборкой паков), их код нужен не при каждом открытии
  // приложения, а только когда пользователь реально нажмёт на кнопку -
  // поэтому не тянем их в основной бандл, а грузим отдельными чанками.
  import('./features/video-note.js').then(m => m.wireVideoNote());
  import('./features/call/wire-call.js').then(m => m.wireCall());
  import('./features/stickers/panel.js').then(m => m.wireStickers());
  wireContacts();
  wireChatControls();
  wireProfile();
  wireThemeSettings();
  wireFontSettings();
  wireMessageSwipe();
  wireMessageEdit();
  wireMessageSelect();
  wireQuoteJump();
  wireMediaViewer();
  wireMessageSearch();
}

document.addEventListener('DOMContentLoaded', wireEvents);
