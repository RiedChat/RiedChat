import { describe, it, expect, vi } from 'vitest';
import { buildQuotedBody } from '../../../../src/net/messaging/outgoing/compose.js';
import { splitQuotedBody, stripQuotedBody, QUOTE_MARKER, QUOTE_ID_DELIM } from '../../../../src/core/text-patterns.js';

describe('buildQuotedBody', () => {
  it('собирает блок цитаты с маркером, автором, текстом цитаты и телом', () => {
    const body = buildQuotedBody({ author: 'Alice', text: 'исходное сообщение' }, 'мой ответ');
    expect(body.startsWith(QUOTE_MARKER)).toBe(true);
    expect(body).toContain('> Alice:\n> исходное сообщение\n\nмой ответ');
  });

  it('без id цитируемого сообщения не добавляет QUOTE_ID_DELIM-блок', () => {
    const body = buildQuotedBody({ author: 'Bob', text: 'текст' }, 'ответ');
    expect(body).not.toContain(QUOTE_ID_DELIM);
  });

  it('встраивает id цитируемого сообщения между QUOTE_ID_DELIM', () => {
    const body = buildQuotedBody({ author: 'Bob', text: 'текст', id: 'msg-42' }, 'ответ');
    expect(body).toContain(QUOTE_ID_DELIM + 'msg-42' + QUOTE_ID_DELIM);
  });

  it('переносы строк в авторе/тексте цитаты схлопываются в пробелы (не ломают формат блока)', () => {
    const body = buildQuotedBody({ author: 'Al\nice', text: 'строка1\nстрока2' }, 'ответ');
    expect(body).toContain('> Al ice:\n> строка1 строка2\n\nответ');
  });

  it('id, содержащий сам разделитель QUOTE_ID_DELIM, экранируется вырезанием разделителя', () => {
    const dirtyId = 'a' + QUOTE_ID_DELIM + 'b';
    const body = buildQuotedBody({ author: 'X', text: 'y', id: dirtyId }, 'z');
    // Разделитель должен встречаться только как открывающий/закрывающий - ровно 2 раза.
    const count = body.split(QUOTE_ID_DELIM).length - 1;
    expect(count).toBe(2);
  });

  it('round trip с splitQuotedBody: rest восстанавливает исходный текст ответа', () => {
    const body = buildQuotedBody({ author: 'Alice', text: 'привет', id: 'm1' }, 'мой ответ');
    const split = splitQuotedBody(body);
    expect(split).not.toBeNull();
    expect(split.author).toBe('Alice');
    expect(split.quoted).toBe('привет');
    expect(split.rest).toBe('мой ответ');
    expect(split.id).toBe('m1');
  });

  it('stripQuotedBody убирает блок цитаты, оставляя только текст', () => {
    const body = buildQuotedBody({ author: 'Alice', text: 'привет' }, 'мой ответ');
    expect(stripQuotedBody(body)).toBe('мой ответ');
  });

  it('текст без блока цитаты (обычное сообщение) - splitQuotedBody возвращает null', () => {
    expect(splitQuotedBody('обычное сообщение без цитаты')).toBeNull();
  });

  it('вручную набранное "> текст" без QUOTE_MARKER не распознаётся как цитата', () => {
    // Это ключевая защита: маркер невозможно набрать с клавиатуры, поэтому
    // пользовательский "> текст\n\nостальное" не должен рендериться как цитата.
    expect(splitQuotedBody('> текст\n\nостальное')).toBeNull();
  });
});
