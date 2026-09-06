// ===================== crypto/vault/base64.js =====================
// Мелкие base64<->ArrayBuffer хелперы, общие для всех режимов vault.

export function b64enc(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
export function b64dec(str){ return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer; }
