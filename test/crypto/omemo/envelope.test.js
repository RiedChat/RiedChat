import { describe, it, expect } from 'vitest';
import { omemo } from '../../../src/crypto/omemo/state.js';
import '../../../src/crypto/omemo/envelope.js';
import { bytes as B } from '../../../src/crypto/bytes.js';

describe('SCE-конверт (XEP-0420) - _buildSceEnvelope/_parseSceEnvelope', () => {
  it('round trip: текст, отправленный в конверте, извлекается обратно', () => {
    const envBytes = omemo._buildSceEnvelope('привет мир', 'alice@example.com');
    const text = omemo._parseSceEnvelope(envBytes, 'alice@example.com');
    expect(text).toBe('привет мир');
  });

  it('экранирует спецсимволы XML внутри текста (защита от инъекции тегов)', () => {
    const envBytes = omemo._buildSceEnvelope('<script>alert(1)</script> & "кавычки"', 'alice@example.com');
    const text = omemo._parseSceEnvelope(envBytes, 'alice@example.com');
    expect(text).toBe('<script>alert(1)</script> & "кавычки"');
    // Сырой XML внутри конверта не должен содержать непроэкранированный тег.
    const xml = B.bufToUtf8(envBytes);
    expect(xml).not.toContain('<script>alert(1)</script>');
  });

  it('несовпадение <from> с реальным отправителем - подмена конверта, бросает ошибку', () => {
    const envBytes = omemo._buildSceEnvelope('текст', 'alice@example.com');
    expect(() => omemo._parseSceEnvelope(envBytes, 'mallory@example.com')).toThrow();
  });

  it('без expectedFromBareJid проверка <from> пропускается', () => {
    const envBytes = omemo._buildSceEnvelope('текст', 'alice@example.com');
    expect(() => omemo._parseSceEnvelope(envBytes, null)).not.toThrow();
  });

  it('каждый вызов добавляет случайный rpad - конверты для одного и того же текста не идентичны байт-в-байт', () => {
    const a = omemo._buildSceEnvelope('одно и то же', 'alice@example.com');
    const b = omemo._buildSceEnvelope('одно и то же', 'alice@example.com');
    expect(B.bufToUtf8(a)).not.toBe(B.bufToUtf8(b));
  });

  it('битый XML после расшифровки - явная ошибка, а не тихий пустой результат', () => {
    const brokenXml = B.utf8ToBuf('<envelope xmlns="urn:xmpp:sce:1"><content>');
    expect(() => omemo._parseSceEnvelope(brokenXml, null)).toThrow(/битый XML/);
  });
});
