// ===================== crypto/bytes.js =====================
// Байты/base64/hex-утилиты + низкоуровневые WebCrypto-примитивы,
// на которых строится настоящий omemo:2 (XEP-0384 §4.4/4.5).

export const bytes = {
  b64FromBuf(buf){
    const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let bin = '';
    for(let i=0;i<arr.length;i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  },
  bufFromB64(b64){
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  },
  randomBytes(n){
    const arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  },
  concat(...parts){
    const arrs = parts.map(p => p instanceof ArrayBuffer ? new Uint8Array(p) : new Uint8Array(p));
    const total = arrs.reduce((s,a) => s+a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    arrs.forEach(a => { out.set(a, off); off += a.length; });
    return out;
  },
  utf8ToBuf(str){ return new TextEncoder().encode(str); },
  bufToUtf8(buf){ return new TextDecoder().decode(buf); },
  hexToBytes(hex){
    hex = hex.replace(/\s+/g,'');
    const arr = new Uint8Array(hex.length/2);
    for(let i=0;i<arr.length;i++) arr[i] = parseInt(hex.substr(i*2,2),16);
    return arr;
  },
  bytesToHex(bytes){
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    let hex = '';
    for(let i=0;i<arr.length;i++) hex += arr[i].toString(16).padStart(2,'0');
    return hex;
  },

  // ---- примитивы для настоящего omemo:2 (XEP-0384 §4.4/4.5) ----
  async hkdfSha256(ikmBytes, saltBytes, infoStr, lengthBytes){
    const ikmKey = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: new TextEncoder().encode(infoStr)
    }, ikmKey, lengthBytes * 8);
    return new Uint8Array(bits);
  },
  async hmacSha256(keyBytes, dataBytes){
    const key = await crypto.subtle.importKey('raw', keyBytes, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
    return new Uint8Array(sig);
  },
  async aesCbcEncrypt(keyBytes, ivBytes, dataBytes){
    // Web Crypto делает PKCS#7-паддинг автоматически для AES-CBC - как и требует спека.
    const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-CBC'}, false, ['encrypt']);
    const buf = await crypto.subtle.encrypt({name:'AES-CBC', iv: ivBytes}, key, dataBytes);
    return new Uint8Array(buf);
  },
  async aesCbcDecrypt(keyBytes, ivBytes, dataBytes){
    const key = await crypto.subtle.importKey('raw', keyBytes, {name:'AES-CBC'}, false, ['decrypt']);
    const buf = await crypto.subtle.decrypt({name:'AES-CBC', iv: ivBytes}, key, dataBytes);
    return new Uint8Array(buf);
  },

  // ---- сериализация ArrayBuffer-based keyPair <-> base64 (identityKey, preKey, signedPreKey) ----
  packKeyPair(kp){
    return { pubKey: this.b64FromBuf(kp.pubKey), privKey: this.b64FromBuf(kp.privKey) };
  },
  unpackKeyPair(o){
    return { pubKey: this.bufFromB64(o.pubKey), privKey: this.bufFromB64(o.privKey) };
  },
};
