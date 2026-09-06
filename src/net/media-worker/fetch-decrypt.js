// ===================== net/media-worker/fetch-decrypt.js =====================
// Скачивание зашифрованного (aesgcm://, XEP-0454) файла и его расшифровка
// AES-256-GCM.
import { extOf, kindOf, MIME_BY_EXT } from './mime.js';

function hexToBytes(hex){
  const out = new Uint8Array(hex.length / 2);
  for(let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

// host === domain, либо host - саб-домен domain (host заканчивается на
// ".domain"), порт при сравнении игнорируется - домен из JID (Strophe.
// getDomainFromJid) порта не содержит вовсе, а host из URL (new URL().host)
// его включает (upload.example.com:5281), из-за чего endsWith всегда
// проваливался бы на нестандартном порту.
function hostMatchesDomain(host, domain){
  if(!domain) return false;
  const hostname = host.split(':')[0];
  return hostname === domain || hostname.endsWith('.' + domain);
}

export async function fetchAndDecrypt(aesgcmUrl, onProgress, allowedHosts, senderDomain){
  const hashIdx = aesgcmUrl.indexOf('#');
  if(hashIdx === -1) throw new Error('нет ключа в ссылке (после #)');
  const withoutScheme = aesgcmUrl.slice('aesgcm://'.length, hashIdx);
  const hex = aesgcmUrl.slice(hashIdx + 1);
  const httpsUrl = 'https://' + withoutScheme;

  // Собеседник (или подменивший его MITM) сам формирует aesgcm://-ссылку и
  // может указать в ней ЛЮБОЙ хост - без проверки мы бы слали туда запрос
  // (и хост узнавал бы наш IP/User-Agent/время прочтения) и показывали бы
  // пользователю ответ произвольного сервера как «вложение». Разрешаем
  // скачивание с хостов из двух источников:
  //   1) allowlist собственных upload-действий (net/upload/slot.js) -
  //      наш сервер/то, что мы сами когда-либо грузили;
  //   2) домен (или саб-домен, напр. upload.<домен>) отправителя сообщения -
  //      то же TOFU-доверие, что уже применяется к identity-ключам OMEMO:
  //      раз мы доверяем этому JID как собеседнику, у которого установлена
  //      OMEMO-сессия, его собственный upload-сервер тоже можно доверять.
  //      Без этого пункта скачивание чужих (особенно с другого сервера)
  //      зашифрованных вложений всегда отваливалось бы с этой ошибкой -
  //      обычные https-картинки такую проверку не проходят вовсе, поэтому
  //      без OMEMO всё "работает", а с OMEMO нет.
  let host;
  try{ host = new URL(httpsUrl).host; }catch(e){ throw new Error('некорректный хост во вложении'); }
  const inOwnAllowlist = Array.isArray(allowedHosts) && allowedHosts.includes(host);
  const trustedBySender = hostMatchesDomain(host, senderDomain);
  if(!inOwnAllowlist && !trustedBySender){
    throw new Error('подозрительное вложение: хост "' + host + '" не входит ни в список доверенных upload-серверов, ни в домен отправителя');
  }

  const keyIvBytes = hexToBytes(hex);
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
  if(resp.body && resp.body.getReader && totalBytes > 0){
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
