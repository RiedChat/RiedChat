// Автоматически сгенерировано при переводе на Vite: side-effect импорты
// в том же порядке, в котором раньше шли <script>/<link> теги в index.html.
// Порядок импортов ниже совпадает с прежним порядком инициализации.

// CSS: Vite сам разрешает @import, склеивает все файлы в один вывод и
// минифицирует - порядок импортов ниже совпадает с прежним порядком
// <link rel="stylesheet"> в index.html, каскад не меняется.
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
import './core/env.js';
import './core/constants.js';
import './core/state.js';
import './core/dom-utils.js';
import './core/safe-html.js';
import './core/storage.js';
import './features/theme-settings.js';
import './core/last-seen-storage.js';
import './core/uuid.js';
import './core/text-patterns.js';
import './features/font-settings/storage.js';
import './features/font-settings/font-face.js';
import './features/font-settings/wire-shared.js';
import './features/font-settings/wire-select.js';
import './features/font-settings/wire-upload.js';
import './features/font-settings/wire-remove.js';
import './features/font-settings/wire.js';
import './crypto/bytes.js';
import './crypto/id3-parser.js';
import './crypto/idb-kv.js';
import './crypto/vault.js';
import './crypto/identity-store.js';
import './crypto/prekey-store.js';
import './crypto/session-store.js';
import './crypto/store.js';
import './crypto/omemo/state.js';
import './crypto/pep/publish-node.js';
import './crypto/omemo/device-list-publish.js';
import './crypto/omemo/bundle.js';
import './crypto/omemo/device-list-discovery.js';
import './crypto/omemo/session-builder.js';
import './crypto/omemo/envelope.js';
import './crypto/omemo/encrypt.js';
import './crypto/omemo/decrypt.js';
import './crypto/omemo/trust.js';
import './net/history/db.js';
import './net/history/threads.js';
import './net/history/media-cache.js';
import './net/history.js';
import './net/message-body-parser.js';
import './net/mam/rsm-query.js';
import './net/mam/backfill.js';
import './net/mam.js';
import './net/media/mime-kind.js';
import './net/media/worker-client.js';
import './net/media.js';
import './net/presence/caps.js';
import './net/presence/disco.js';
import './net/presence/incoming.js';
import './net/roster.js';
import './net/connection/connect.js';
import './net/connection/resilience.js';
import './net/connection/bootstrap.js';
import './core/image-utils.js';
import './net/vcard-storage.js';
import './net/vcard.js';
import './net/messaging/incoming.js';
import './net/messaging/outgoing.js';
import './net/upload/encrypt.js';
import './net/upload/slot.js';
import './net/upload/transport.js';
import './net/upload.js';
import './ui/vault-modal.js';
import './ui/login-screen.js';
import './ui/roster.js';
import './ui/chat-head.js';
import './ui/chat-view/message-body-html.js';
import './ui/chat-view/bubble-renderers.js';
import './ui/chat-view/render-messages.js';
import './ui/chat-view/media-loader.js';
import './ui/chat-view/video-poster.js';
import './ui/chat-view/unread-tracking.js';
import './ui/voice-player/audio-lifecycle.js';
import './ui/voice-player/waveform-draw.js';
import './ui/voice-player/waveform-peaks.js';
import './ui/voice-player/waveform-player.js';
import './ui/voice-player/track-player.js';
import './ui/voice-player/mount.js';
import './ui/fingerprint-modal.js';
import './ui/swipe-config.js';
import './ui/swipe-hints.js';
import './ui/swipe-gesture.js';
import './ui/modals.js';
import './features/login.js';
import './features/viewport.js';
import './features/composer.js';
import './features/message-swipe.js';
import './features/message-select.js';
import './features/file-upload.js';
import './features/voice-recorder.js';
// video-note.js, stickers/panel.js и его storage.js больше не импортируются
// здесь статически: они попадают в отдельный чанк через динамический
// import() в app.js (wireEvents) - этот side-effect-импорт был чистым
// дублированием и не давал чанку отделиться от main.js.
import './features/contacts.js';
import './features/chat-controls.js';
import './features/wallpaper/storage.js';
import './features/wallpaper/render.js';
import './features/wallpaper/modal.js';
import './features/video-settings.js';
import './features/profile.js';
import './features/media-viewer.js';
import './features/message-search.js';
import './app.js';

// Переводит статическую разметку index.html (data-i18n/-placeholder/-title)
// один раз при старте; динамический текст сам вызывает t() при рендере.
applyDom();
