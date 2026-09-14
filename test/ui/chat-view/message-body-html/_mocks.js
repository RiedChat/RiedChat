import { vi } from 'vitest';

vi.mock('../../../../src/net/media.js', () => ({
  media: {
    AESGCM_RE: /aesgcm:\/\/[^\s#]+#[0-9a-fA-F]+/g,
    kindOf: vi.fn(),
    extOf: vi.fn((url) => (url.split('.').pop() || '').split('#')[0]),
    isAesgcm: (url) => /^aesgcm:\/\//i.test(url),
    isStickerPack: vi.fn(() => false),
    isVideoNote: vi.fn(() => false),
    getCached: vi.fn(() => undefined),
    extractThumbDataUrl: vi.fn(() => null),
  },
}));
vi.mock('../../../../src/features/message-swipe.js', () => ({ mediaLabel: vi.fn((kind) => '[' + kind + ']') }));
vi.mock('../../../../src/features/video-settings.js', () => ({ loadVideoAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/features/image-settings.js', () => ({ loadImageAutoDownloadEnabled: vi.fn(() => false) }));
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ isTrustedContact: vi.fn(() => false) }));
vi.mock('../../../../src/core/state.js', () => ({ state: { activeChat: 'alice@example.com' } }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

export const nextSeq = (() => { let n = 0; return () => n++; })();
