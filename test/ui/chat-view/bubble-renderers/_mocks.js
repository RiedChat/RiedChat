import { vi } from 'vitest';
import { raw } from '../../../../src/core/safe-html.js';

vi.mock('../../../../src/net/media.js', () => ({ media: { getCached: vi.fn() } }));
vi.mock('../../../../src/ui/chat-view/message-body-html.js', () => ({ formatMessageBody: vi.fn() }));
vi.mock('../../../../src/features/autoload-settings.js', async () => {
  const { isTrustedContact } = await import('../../../../src/net/trusted-contacts.js');
  const { state } = await import('../../../../src/core/state.js');
  const autoload = {
    video: { load: vi.fn(() => false) },
    audio: { load: vi.fn(() => true) },
    videonote: { load: vi.fn(() => false) },
    image: { load: vi.fn(() => false) },
    sticker: { load: vi.fn(() => false) },
    file: { load: vi.fn(() => false) },
  };
  const { media } = await import('../../../../src/net/media.js');
  const { categoryOf } = await import('../../../../src/net/media/mime-kind.js');
  return {
    autoload,
    // Как features/autoload-settings.js:shouldHoldOff: ключ настройки - categoryOf(kind, url).
    shouldHoldOff: ({ out, url, kind }) => {
      if(out || media.getCached(url)?.status === 'done') return false;
      const key = categoryOf(kind, url);
      return key !== 'image' && !!autoload[key] && !autoload[key].load();
    },
    canAutoLoadImage: (out) => out || (autoload.image.load() && isTrustedContact(state.activeChat)),
  };
});
vi.mock('../../../../src/net/trusted-contacts.js', () => ({ isTrustedContact: vi.fn(() => false) }));
vi.mock('../../../../src/core/state.js', () => ({ state: { activeChat: 'alice@example.com' } }));
vi.mock('../../../../src/i18n/t.js', () => ({ t: (key) => key }));

export const ctx = { lock: raw(''), time: '12:00', ticks: raw('') };
