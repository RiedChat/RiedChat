// ===================== crypto/id3-parser.js =====================
// Лёгкий ID3v2 (2.2/2.3/2.4) парсер: только то, что нужно ui/voice-player/*.
// Достаёт TIT2/TT2 (название), TPE1/TP1 (исполнитель) и APIC/PIC (обложка).
// Никаких внешних зависимостей - файлы приходят как расшифрованный blob,
// тянуть с CDN парсер тегов было бы лишней точкой отказа.
// Выделено из ui/voice-player.js: чистый бинарный парсинг без DOM/App.ui,
// живёт рядом с остальными байт-утилитами (crypto/bytes.js).

function readSyncSafe(b, o){
  return ((b[o]&0x7f)<<21) | ((b[o+1]&0x7f)<<14) | ((b[o+2]&0x7f)<<7) | (b[o+3]&0x7f);
}
function readUInt32BE(b, o){
  return (((b[o]<<24) | (b[o+1]<<16) | (b[o+2]<<8) | b[o+3]) >>> 0);
}
function decodeText(bytes, encoding){
  try{
    let dec;
    if(encoding === 1){
      const bom = bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf-16le' : 'utf-16be';
      dec = new TextDecoder(bom); bytes = bytes.subarray(2);
    } else if(encoding === 2){ dec = new TextDecoder('utf-16be'); }
    else if(encoding === 3){ dec = new TextDecoder('utf-8'); }
    else { dec = new TextDecoder('iso-8859-1'); }
    return dec.decode(bytes).replace(/\u0000+$/, '').trim();
  }catch(e){ return ''; }
}

export function parseId3(arrayBuffer){
  const bytes = new Uint8Array(arrayBuffer);
  if(bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null; // "ID3"
  const version = bytes[3];
  const tagSize = readSyncSafe(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize);
  const headerLen = version === 2 ? 6 : 10;
  const out = {};
  let offset = 10;

  while(offset + headerLen <= end){
    let frameId, frameSize;
    if(version === 2){
      frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2]);
      frameSize = (bytes[offset+3]<<16) | (bytes[offset+4]<<8) | bytes[offset+5];
    } else {
      frameId = String.fromCharCode(bytes[offset], bytes[offset+1], bytes[offset+2], bytes[offset+3]);
      frameSize = version === 4 ? readSyncSafe(bytes, offset+4) : readUInt32BE(bytes, offset+4);
    }
    if(!frameId.trim() || frameSize <= 0 || offset + headerLen + frameSize > end) break;

    const body = bytes.subarray(offset + headerLen, offset + headerLen + frameSize);
    if((frameId === 'TIT2' || frameId === 'TT2') && !out.title){
      out.title = decodeText(body.subarray(1), body[0]);
    } else if((frameId === 'TPE1' || frameId === 'TP1') && !out.artist){
      out.artist = decodeText(body.subarray(1), body[0]);
    } else if((frameId === 'APIC' || frameId === 'PIC') && !out.cover){
      try{
        const enc = body[0];
        let p = 1, mime;
        if(frameId === 'APIC'){
          let e = p; while(body[e] !== 0 && e < body.length) e++;
          mime = decodeText(body.subarray(p, e), 0) || 'image/jpeg'; p = e + 1;
          p += 1; // picture type byte
        } else {
          mime = 'image/' + (decodeText(body.subarray(p, p+3), 0) || 'jpeg').toLowerCase(); p += 3;
          p += 1;
        }
        if(enc === 1 || enc === 2){
          let e = p; while(!(body[e] === 0 && body[e+1] === 0) && e < body.length) e += 2;
          p = e + 2;
        } else {
          let e = p; while(body[e] !== 0 && e < body.length) e++;
          p = e + 1;
        }
        out.cover = URL.createObjectURL(new Blob([body.subarray(p)], {type: mime}));
      }catch(e){ /* обложка необязательна */ }
    }
    offset += headerLen + frameSize;
  }
  return (out.title || out.artist || out.cover) ? out : null;
}

export const id3 = { parse: parseId3 };
