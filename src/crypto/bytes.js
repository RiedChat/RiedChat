// ===================== crypto/bytes.js =====================
// Байты/base64/hex-утилиты и WebCrypto-примитивы для omemo:2 (XEP-0384 §4.4/4.5).

export function b64FromBuf(buf){
  // Принимает ArrayBuffer или typed array/DataView. ArrayBuffer.isView вместо instanceof:
  // буфер из другого realm (iframe, jsdom) не instanceof нашего ArrayBuffer.
  const arr = ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
  return btoa(Array.from(arr, c => String.fromCharCode(c)).join(''));
}
export function bufFromB64(b64){
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
}
export function randomBytes(n){
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}
export function concat(...parts){
  const arrs = parts.map(p => new Uint8Array(p));
  const total = arrs.reduce((s,a) => s+a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  arrs.forEach(a => { out.set(a, off); off += a.length; });
  return out;
}
export function utf8ToBuf(str){ return new TextEncoder().encode(str); }
export function bufToUtf8(buf){ return new TextDecoder().decode(buf); }
export function hexToBytes(hex){
  return Uint8Array.from(hex.replace(/\s+/g, '').match(/../g) ?? [], h => parseInt(h, 16));
}
export function bytesToHex(bytes){
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

// ---- примитивы для настоящего omemo:2 (XEP-0384 §4.4/4.5) ----
export async function hkdfSha256(ikmBytes, saltBytes, infoStr, lengthBytes){
  const ikmKey = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: utf8ToBuf(infoStr)
  }, ikmKey, lengthBytes * 8);
  return new Uint8Array(bits);
}
export async function hmacSha256(keyBytes, dataBytes){
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}
// op: 'encrypt' | 'decrypt'. Web Crypto сам делает PKCS#7-паддинг для AES-CBC, как требует спека.
export async function aesCbc(op, keyBytes, ivBytes, dataBytes){
  const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-CBC'}, false, [op]);
  return new Uint8Array(await crypto.subtle[op]({name:'AES-CBC', iv: ivBytes}, key, dataBytes));
}

// 80 байт HKDF-SHA-256(contentKey, соль=32 нулевых байта, info="OMEMO Payload"):
// ключ шифрования, ключ аутентификации, IV (XEP-0384 §4.4/4.5).
export async function omemoPayloadKeys(contentKey){
  const hk = await hkdfSha256(contentKey, new Uint8Array(32), 'OMEMO Payload', 80);
  return { encKey: hk.slice(0, 32), authKey: hk.slice(32, 64), iv: hk.slice(64, 80) };
}
// Constant-time сравнение: без раннего выхода по первому несовпадению (тайминг-канал по валидности тега).
export function timingSafeEqual(a, b){
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for(let i = 0; i < len; i++){
    diff |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
  }
  return diff === 0;
}
// AES-256-GCM со случайным 12-байтным IV. Здесь, а не в vault/*: bytes.js без зависимостей,
// доступен в воркере net/media-worker, где vault/UI нет.
export async function aesGcmEncrypt(key, buf){
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  return { iv, data };
}
export async function aesGcmDecrypt(key, iv, data){
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
}

// ---- сериализация ArrayBuffer-based keyPair <-> base64 (identityKey, preKey, signedPreKey) ----
export function packKeyPair(kp){
  return { pubKey: b64FromBuf(kp.pubKey), privKey: b64FromBuf(kp.privKey) };
}
export function unpackKeyPair(o){
  return { pubKey: bufFromB64(o.pubKey), privKey: bufFromB64(o.privKey) };
}

export function toBase64Url(base64){
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const fromBase64Url = (s) =>
  s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
