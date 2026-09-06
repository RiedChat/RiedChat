import { describe, it, expect } from 'vitest';
import { bytes as B } from '../../src/crypto/bytes.js';

describe('bytes: base64/hex round trip', () => {
  it('b64FromBuf/bufFromB64 - round trip для ArrayBuffer', () => {
    const original = new Uint8Array([0, 1, 2, 254, 255, 127, 128]);
    const b64 = B.b64FromBuf(original.buffer);
    const back = new Uint8Array(B.bufFromB64(b64));
    expect(Array.from(back)).toEqual(Array.from(original));
  });

  it('b64FromBuf принимает и Uint8Array напрямую (не только ArrayBuffer)', () => {
    const arr = new Uint8Array([10, 20, 30]);
    expect(B.b64FromBuf(arr)).toBe(B.b64FromBuf(arr.buffer));
  });

  it('hexToBytes/bytesToHex - round trip, регистр нормализуется в нижний', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xff, 0xa5]);
    const hex = B.bytesToHex(bytes);
    expect(hex).toBe('000fffa5');
    const back = B.hexToBytes(hex.toUpperCase());
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('hexToBytes игнорирует пробелы-разделители', () => {
    expect(Array.from(B.hexToBytes('de ad be ef'))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });
});

describe('bytes.concat', () => {
  it('склеивает несколько Uint8Array/ArrayBuffer подряд, без разделителя', () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]).buffer;
    const out = B.concat(a, b);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it('пустой список частей даёт пустой результат', () => {
    expect(B.concat().length).toBe(0);
  });
});

describe('bytes.utf8ToBuf/bufToUtf8', () => {
  it('round trip сохраняет не-ASCII текст (кириллица, эмодзи)', () => {
    const text = 'привет 👋 мир';
    expect(B.bufToUtf8(B.utf8ToBuf(text))).toBe(text);
  });
});

describe('bytes: WebCrypto примитивы (HKDF/HMAC/AES-CBC) - используются в OMEMO v2 payload', () => {
  it('hkdfSha256 детерминирован для одинаковых входов и даёт запрошенную длину', async () => {
    const ikm = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(32);
    const out1 = await B.hkdfSha256(ikm, salt, 'OMEMO Payload', 80);
    const out2 = await B.hkdfSha256(ikm, salt, 'OMEMO Payload', 80);
    expect(out1.length).toBe(80);
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });

  it('hkdfSha256 с другим info даёт другой результат (доменное разделение ключей)', async () => {
    const ikm = new Uint8Array(32).fill(7);
    const salt = new Uint8Array(32);
    const a = await B.hkdfSha256(ikm, salt, 'OMEMO Payload', 32);
    const b = await B.hkdfSha256(ikm, salt, 'Something Else', 32);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('hmacSha256 детерминирован и даёт 32 байта', async () => {
    const key = new Uint8Array(32).fill(1);
    const data = B.utf8ToBuf('данные для подписи');
    const mac1 = await B.hmacSha256(key, data);
    const mac2 = await B.hmacSha256(key, data);
    expect(mac1.length).toBe(32);
    expect(Array.from(mac1)).toEqual(Array.from(mac2));
  });

  it('aesCbcEncrypt/aesCbcDecrypt - round trip с PKCS7-паддингом', async () => {
    const key = new Uint8Array(32).fill(9);
    const iv = new Uint8Array(16).fill(3);
    const plaintext = B.utf8ToBuf('секретное сообщение произвольной длины');
    const ciphertext = await B.aesCbcEncrypt(key, iv, plaintext);
    expect(ciphertext.length % 16).toBe(0);
    const decrypted = await B.aesCbcDecrypt(key, iv, ciphertext);
    expect(B.bufToUtf8(decrypted)).toBe('секретное сообщение произвольной длины');
  });

  it('aesCbcDecrypt с неверным ключом не даёт исходный текст (и обычно бросает из-за паддинга)', async () => {
    const key = new Uint8Array(32).fill(9);
    const wrongKey = new Uint8Array(32).fill(8);
    const iv = new Uint8Array(16).fill(3);
    const ciphertext = await B.aesCbcEncrypt(key, iv, B.utf8ToBuf('текст'));
    await expect(B.aesCbcDecrypt(wrongKey, iv, ciphertext)).rejects.toThrow();
  });
});

describe('bytes.packKeyPair/unpackKeyPair', () => {
  it('round trip сохраняет pubKey/privKey как ArrayBuffer', () => {
    const kp = { pubKey: new Uint8Array([1, 2, 3]).buffer, privKey: new Uint8Array([4, 5, 6]).buffer };
    const packed = B.packKeyPair(kp);
    expect(typeof packed.pubKey).toBe('string');
    const unpacked = B.unpackKeyPair(packed);
    expect(Array.from(new Uint8Array(unpacked.pubKey))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(unpacked.privKey))).toEqual([4, 5, 6]);
  });
});
