import { describe, it, expect, vi, beforeAll } from 'vitest';

// Strophe - глобал (подключается в index.html как script), в модуле не
// импортируется. Ставим минимальный стаб до импорта тестируемого файла.
beforeAll(() => {
  global.Strophe = { getText: (el) => (el ? el.textContent : '') };
});

vi.mock('../../src/crypto/omemo/state.js', () => ({
  omemo: { decryptStanza: vi.fn() },
}));

import { parseMessageBody, extractFileUrl } from '../../src/net/message-body-parser.js';
import { omemo } from '../../src/crypto/omemo/state.js';

function parseStanza(xml) {
  return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('extractFileUrl', () => {
  it('находит https-ссылку в jabber:x:oob', () => {
    const el = parseStanza(`<message><x xmlns="jabber:x:oob"><url>https://example.com/f.png</url></x></message>`);
    expect(extractFileUrl(el)).toBe('https://example.com/f.png');
  });

  it('находит зашифрованную aesgcm:// ссылку', () => {
    const el = parseStanza(`<message><x xmlns="jabber:x:oob"><url>aesgcm://host/f.png#key</url></x></message>`);
    expect(extractFileUrl(el)).toBe('aesgcm://host/f.png#key');
  });

  it('отклоняет запрещённую схему (javascript:) - возвращает null', () => {
    const el = parseStanza(`<message><x xmlns="jabber:x:oob"><url>javascript:alert(1)</url></x></message>`);
    expect(extractFileUrl(el)).toBeNull();
  });

  it('falls back на reference source, если нет x/oob', () => {
    const el = parseStanza(`<message><reference><source uri="ignored"/></reference><reference><source>https://example.com/g.png</source></reference></message>`);
    expect(extractFileUrl(el)).toBe('https://example.com/g.png');
  });

  it('нет ни одной ссылки - null', () => {
    const el = parseStanza(`<message><body>текст</body></message>`);
    expect(extractFileUrl(el)).toBeNull();
  });
});

describe('parseMessageBody', () => {
  it('незашифрованное сообщение с body - возвращает {body, encrypted:false}', async () => {
    const el = parseStanza(`<message><body>привет</body></message>`);
    await expect(parseMessageBody(el)).resolves.toEqual({ body: 'привет', encrypted: false });
  });

  it('body отсутствует, но есть fileUrl - body заменяется на fileUrl', async () => {
    const el = parseStanza(`<message><x xmlns="jabber:x:oob"><url>https://example.com/f.png</url></x></message>`);
    await expect(parseMessageBody(el)).resolves.toEqual({ body: 'https://example.com/f.png', encrypted: false });
  });

  it('<encrypted> есть - вызывает omemo.decryptStanza и возвращает {body, encrypted:true}', async () => {
    omemo.decryptStanza.mockResolvedValue('расшифровано');
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseMessageBody(el)).resolves.toEqual({ body: 'расшифровано', encrypted: true });
    expect(omemo.decryptStanza).toHaveBeenCalledWith(el);
  });

  it('decryptStanza вернул null (адресовано другому устройству) - parseMessageBody возвращает null', async () => {
    omemo.decryptStanza.mockResolvedValue(null);
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseMessageBody(el)).resolves.toBeNull();
  });

  it('decryptStanza бросил исключение - ловится, результат null', async () => {
    omemo.decryptStanza.mockRejectedValue(new Error('boom'));
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseMessageBody(el)).resolves.toBeNull();
  });
});
