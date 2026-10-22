// ===================== net/media-worker/fetch-decrypt.js =====================
// Скачивание aesgcm:// (XEP-0454) файла и расшифровка AES-256-GCM.
import * as bytes from '../../crypto/bytes.js';
import { extOf, kindOf, parseAesgcmFragment, MIME_BY_EXT } from '../media/mime-kind.js';

// host === domain или саб-домен domain (".domain"); порт игнорируется: домен из JID порта не
// содержит, а host из URL его включает (upload.example.com:5281) - endsWith иначе всегда бы промахивался.
function hostMatchesDomain(host, domain){
  if(!domain) return false;
  const hostname = host.split(':')[0];
  return hostname === domain || hostname.endsWith('.' + domain);
}

export async function fetchAndDecrypt(aesgcmUrl, onProgress, allowedHosts, senderDomain){
  const hashIdx = aesgcmUrl.indexOf('#');
  if(hashIdx === -1) throw new Error('нет ключа в ссылке (после #)');
  const withoutScheme = aesgcmUrl.slice('aesgcm://'.length, hashIdx);
  // Хвосты после ключа ('#<hexKeyIv>;t=<превью>;n=<имя>', см. media/thumb-codec.js, upload.js)
  // для расшифровки не нужны - берём только keyHex.
  const { keyHex: hex } = parseAesgcmFragment(aesgcmUrl.slice(hashIdx + 1));
  const httpsUrl = 'https://' + withoutScheme;

  // Собеседник (или MITM) формирует aesgcm://-ссылку и может указать ЛЮБОЙ хост - запрос раскрыл бы
  // наш IP/User-Agent/время прочтения, а ответ чужого сервера показали бы как вложение.
  // Разрешены хосты:
  //   1) allowlist своих upload-действий (net/upload/slot.js);
  //   2) домен или саб-домен (upload.<домен>) отправителя - то же TOFU-доверие, что к его
  //      OMEMO identity-ключам. Без этого вложения с чужого сервера всегда отваливались бы
  //      (обычные https-картинки проверку не проходят, поэтому без OMEMO всё работало).
  let host;
  try{ host = new URL(httpsUrl).host; }catch{ throw new Error('некорректный хост во вложении'); }
  const inOwnAllowlist = Array.isArray(allowedHosts) && allowedHosts.includes(host);
  const trustedBySender = hostMatchesDomain(host, senderDomain);
  if(!inOwnAllowlist && !trustedBySender){
    throw new Error('подозрительное вложение: хост "' + host + '" не входит ни в список доверенных upload-серверов, ни в домен отправителя');
  }

  const keyIvBytes = bytes.hexToBytes(hex);
  const KEY_LEN = 32;
  const ivLen = keyIvBytes.length - KEY_LEN;
  if(ivLen !== 12 && ivLen !== 16){
    throw new Error('неожиданная длина ключа/IV: ' + keyIvBytes.length + ' байт');
  }
  const iv = keyIvBytes.slice(0, ivLen);
  const rawKey = keyIvBytes.slice(ivLen);

  const resp = await fetch(httpsUrl);
  if(!resp.ok) throw new Error('HTTP ' + resp.status + ' при загрузке файла');

  const totalBytes = Number(resp.headers.get('content-length')) || 0;
  let encrypted;
  if(resp.body?.getReader && totalBytes > 0){
    const reader = resp.body.getReader();
    const chunks = [];
    let received = 0;
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      chunks.push(value);
      received += value.length;
      const pct = Math.min(99, Math.round((received / totalBytes) * 100));
      onProgress && onProgress(pct);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for(const chunk of chunks){ merged.set(chunk, offset); offset += chunk.length; }
    encrypted = merged.buffer;
  } else {
    encrypted = await resp.arrayBuffer();
  }

  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, {name:'AES-GCM'}, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv}, cryptoKey, encrypted);

  const ext = extOf(httpsUrl);
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  const blob = new Blob([decrypted], {type: mime});
  const kind = kindOf(ext);
  return { blob, kind };
}
