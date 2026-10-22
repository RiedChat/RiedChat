import { describe, it, expect, vi, beforeAll } from 'vitest';

// Strophe - глобал (script в index.html), не импортируется: ставим стаб до импорта тестируемого файла.
beforeAll(() => {
  global.Strophe = { getText: (el) => (el ? el.textContent : '') };
});

vi.mock('../../src/crypto/omemo/state.js', () => ({
  omemo: { decryptStanza: vi.fn() },
}));
vi.mock('../../src/core/state.js', () => ({
  state: { myBareJid: 'me@example.com' },
}));

import { parseMessageBody, parseIncomingBody } from '../../src/net/message-body-parser.js';
import { omemo } from '../../src/crypto/omemo/state.js';

function parseStanza(xml) {
  return new DOMParser().parseFromString(xml, 'text/xml').documentElement;
}

describe('ссылка на вложение в parseMessageBody', () => {
  const fileUrlOf = async (xml) => (await parseMessageBody(parseStanza(xml))).body;

  it('находит https-ссылку в jabber:x:oob', async () => {
    await expect(fileUrlOf(`<message><x xmlns="jabber:x:oob"><url>https://example.com/f.png</url></x></message>`)).resolves.toBe('https://example.com/f.png');
  });

  it('находит зашифрованную aesgcm:// ссылку', async () => {
    await expect(fileUrlOf(`<message><x xmlns="jabber:x:oob"><url>aesgcm://host/f.png#key</url></x></message>`)).resolves.toBe('aesgcm://host/f.png#key');
  });

  it('отклоняет запрещённую схему (javascript:) - body остаётся пустым', async () => {
    await expect(fileUrlOf(`<message><x xmlns="jabber:x:oob"><url>javascript:alert(1)</url></x></message>`)).resolves.toBe('');
  });

  it('находит ссылку в reference source, если нет x/oob', async () => {
    await expect(fileUrlOf(`<message><reference><source uri="ignored"/></reference><reference><source>https://example.com/g.png</source></reference></message>`)).resolves.toBe('https://example.com/g.png');
  });

  it('нет ни одной ссылки - body пустой', async () => {
    await expect(fileUrlOf(`<message></message>`)).resolves.toBe('');
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

describe('parseIncomingBody', () => {
  it('обычное сообщение - возвращает разобранное тело', async () => {
    const el = parseStanza(`<message><body>привет</body></message>`);
    await expect(parseIncomingBody(el, 'alice@example.com')).resolves.toEqual({ body: 'привет', encrypted: false });
  });

  it('parseMessageBody вернул null (адресовано другому устройству) - null', async () => {
    omemo.decryptStanza.mockResolvedValue(null);
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseIncomingBody(el, 'alice@example.com')).resolves.toBeNull();
  });

  it('пустое тело - null', async () => {
    const el = parseStanza(`<message><body></body></message>`);
    await expect(parseIncomingBody(el, 'alice@example.com')).resolves.toBeNull();
  });

  it('зашифрованное сообщение от нашего же bare JID (эхо для синхронизации) - null', async () => {
    omemo.decryptStanza.mockResolvedValue('x');
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseIncomingBody(el, 'me@example.com')).resolves.toBeNull();
  });

  it('зашифрованное сообщение от контакта - возвращается как есть', async () => {
    omemo.decryptStanza.mockResolvedValue('секрет');
    const el = parseStanza(`<message><encrypted xmlns="eu.siacs.conversations.axolotl"/></message>`);
    await expect(parseIncomingBody(el, 'alice@example.com')).resolves.toEqual({ body: 'секрет', encrypted: true });
  });
});
