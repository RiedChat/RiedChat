// ===================== app.js =====================
// Точка входа: открытие чата и подключение обработчиков из features/*.js.
import { $, isAppActive } from './core/dom-utils.js';
import { persistLastScreen } from './core/last-seen-storage.js';
import { state } from './core/state.js';
import { omemo } from './crypto/omemo/state.js';
import { wireChatControls } from './features/chat-controls.js';
import { wireComposer } from './features/composer.js';
import { wireContacts } from './features/contacts.js';
import { wireFileUpload } from './features/file-upload.js';
import { wireFontSettings } from './features/font-settings/wire.js';
import { wireLogin } from './features/login.js';
import { wireMediaViewer } from './features/media-viewer.js';
import { wireMessageEdit } from './features/message-edit.js';
import { wireMessageSearch } from './features/message-search.js';
import { wireMessageSelect } from './features/message-select/long-press.js';
import { wireMessageSwipe } from './features/message-swipe/wire.js';
import { wireProfile } from './features/profile/modal.js';
import { wireQuoteJump } from './features/quote-jump.js';
import { wireThemeSettings } from './features/theme-settings.js';
import { wireViewport } from './features/viewport.js';
import { wireVoiceRecorder } from './features/voice-recorder/recorder.js';
import { wireResilience, reconnectIfNeeded } from './net/connection/resilience.js';
import { renderCallBanner } from './ui/call-view.js';
import { renderChatHead, updateOmemoBadge, renderReplyBar } from './ui/chat-head.js';
import { renderMessages } from './ui/chat-view/render-messages.js';
import { markChatRead } from './ui/chat-view/unread-tracking.js';
import { renderRoster, onRosterOpen } from './ui/roster.js';
import { checkSecurityWarnings } from './ui/security-warnings.js';

export function openChat(jid){
  state.activeChat = jid;
  state.replyTo = null; // привязана к чату
  state.editing = null; // привязано к чату
  persistLastScreen(jid); // чтобы при входе открыть тот же чат
  $('empty-state').style.display = 'none';
  $('conversation').style.display = 'flex';
  renderChatHead();
  renderMessages();
  renderReplyBar();
  renderCallBanner();
  // Открытие чата = прочитано: бейдж в ростере пропадает сразу и не возвращается после перезагрузки.
  markChatRead(jid);
  renderRoster();
  $('app').classList.add('mobile-chat-open');
  omemo.getDeviceList(jid).then(() => updateOmemoBadge());
  if(window.innerWidth > 768) $('msg-input').focus();
  // Крипто-предупреждения по контакту (смена identity-ключа, новое устройство).
  checkSecurityWarnings(jid);
}

onRosterOpen(openChat);

// Вызывается из Android (onBackPressed): true - "назад" обработан (закрыта модалка/чат),
// false - нечего обрабатывать, Android сам сделает goBack() или свернёт приложение.
function handleAndroidBack(){
  // Нативный <dialog> (confirm, vault, отпечатки) закрываем как Escape: close('cancel') даёт тот же результат, что клик по фону.
  const openDialog = document.querySelector('dialog[open]');
  if(openDialog){
    openDialog.close('cancel');
    return true;
  }
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

// Вызывается из Android (onResume): visibilitychange/pageshow в WebView при
// сворачивании ненадёжны, поэтому reconnectIfNeeded вызывается явно.
window.__androidResume = function(){
  if(!isAppActive()) return; // ещё не залогинены
  reconnectIfNeeded();
};

function wireEvents(){
  wireResilience();
  wireViewport();
  wireLogin();
  wireComposer();
  wireFileUpload();
  wireVoiceRecorder();
  // Звонки/кружки/стикеры тяжёлые и нужны только по нажатию - грузим отдельными чанками.
  import('./features/video-note.js').then(m => m.wireVideoNote());
  import('./features/call/wire-call.js').then(m => m.wireCall());
  import('./features/stickers/panel-events.js').then(m => m.wirePanelEvents());
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
