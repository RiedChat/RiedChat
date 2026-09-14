import { vi } from 'vitest';

vi.mock('../../../../src/net/media.js', () => ({
  media: { getCached: vi.fn(), isVideoNote: vi.fn(() => false), isSticker: vi.fn(() => false), extractThumbDataUrl: vi.fn(() => null) },
}));
vi.mock('../../../../src/ui/chat-view/message-body-html.js', () => ({ formatMessageBody: vi.fn() }));
vi.mock('../../../../src/features/video-settings.js', () => ({ loadVideoAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/features/audio-settings.js', () => ({ loadAudioAutoDownloadEnabled: vi.fn(() => true) }));
vi.mock('../../../../src/features/video-note-settings.js', () => ({ loadVideoNoteAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/features/image-settings.js', () => ({ loadImageAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/features/sticker-settings.js', () => ({ loadStickerAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ isTrustedContact: vi.fn(() => false) }));
vi.mock('../../../../src/core/state.js', () => ({ state: { activeChat: 'alice@example.com' } }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

export const ctx = { lock: '', time: '<span>12:00</span>', ticks: '', nextSeq: (() => { let n = 0; return () => n++; })() };
