// Здесь только CSS (порядок прежний - каскад не меняется), debug-log и модули с побочным эффектом, не достижимые из app.js.

// CSS: порядок совпадает с прежним порядком <link>, каскад не меняется.
import './css/base.css';
import './css/login.css';
import './css/sidebar.css';
import './css/chat-header.css';
import './css/messages.css';
import './css/media-messages.css';
import './css/voice-player.css';
import './css/composer.css';
import './css/stickers.css';
import './css/modals.css';
import './css/video-note.css';
import './css/message-select.css';
import './css/mobile.css';
import './css/call.css';

import { applyDom } from './i18n/t.js';
import './core/debug-log.js';
// Расширяют omemo (crypto/omemo/state.js) побочным эффектом и не достижимы из app.js - импорт обязателен, порядок прежний.
import './crypto/pep/publish-node.js';
import './crypto/omemo/device-list-publish.js';
import './crypto/omemo/bundle.js';
import './crypto/omemo/device-list-discovery.js';
import './crypto/omemo/session-builder.js';
import './crypto/omemo/envelope.js';
import './crypto/omemo/encrypt.js';
import './crypto/omemo/decrypt.js';
import './crypto/omemo/trust.js';
// video-note.js и stickers/panel-events.js не импортируются здесь: грузятся отдельным чанком
// через import() в app.js (wireEvents).
import './app.js';

// Переводит статику index.html (data-i18n*) один раз при старте; динамический текст вызывает t() сам.
applyDom();
