// ===================== ui/voice-player/id3-parser.js =====================
// Лёгкий ID3v2 (2.2/2.3/2.4) парсер для ui/voice-player/*: TIT2/TT2 (название), TPE1/TP1 (исполнитель), APIC/PIC (обложка). Без зависимостей (парсер с CDN - лишняя точка отказа), чистый бинарный разбор без DOM/App.ui.

function readSyncSafe(b, o){
  return ((b[o]&0x7f)<<21) | ((b[o+1]&0x7f)<<14) | ((b[o+2]&0x7f)<<7) | (b[o+3]&0x7f);
}
function decodeText(bytes, encoding){
  let label = { 2: 'utf-16be', 3: 'utf-8' }[encoding] || 'iso-8859-1';
  if(encoding === 1){
    label = bytes[0] === 0xFF && bytes[1] === 0xFE ? 'utf-16le' : 'utf-16be';
    bytes = bytes.subarray(2);
  }
  try{ return new TextDecoder(label).decode(bytes).replace(/\u0000+$/, '').trim(); }catch{ return ''; }
}

// Текстовые фреймы (v2.3/2.4 и v2.2) -> поле результата.
const TEXT_FRAMES = { TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist' };

// Индекс первого нулевого терминатора с p: один байт (wide=false) или пара нулевых байт на двухбайтной границе (UTF-16, wide=true).
function findNull(body, p, wide){
  let e = p;
  if(wide){
    while(!(body[e] === 0 && body[e+1] === 0) && e < body.length) e += 2;
  } else {
    while(body[e] !== 0 && e < body.length) e++;
  }
  return e;
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
      frameSize = version === 4 ? readSyncSafe(bytes, offset+4) : new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset+4);
    }
    if(!frameId.trim() || frameSize <= 0 || offset + headerLen + frameSize > end) break;

    const body = bytes.subarray(offset + headerLen, offset + headerLen + frameSize);
    const textField = TEXT_FRAMES[frameId];
    if(textField){
      if(!out[textField]) out[textField] = decodeText(body.subarray(1), body[0]);
    } else if((frameId === 'APIC' || frameId === 'PIC') && !out.cover){
      try{
        const enc = body[0];
        let p = 1, mime;
        if(frameId === 'APIC'){
          const e = findNull(body, p, false);
          mime = decodeText(body.subarray(p, e), 0) || 'image/jpeg'; p = e + 1;
          p += 1; // picture type byte
        } else {
          mime = 'image/' + (decodeText(body.subarray(p, p+3), 0) || 'jpeg').toLowerCase(); p += 3;
          p += 1;
        }
        const wide = enc === 1 || enc === 2;
        p = findNull(body, p, wide) + (wide ? 2 : 1); // пропускаем описание обложки
        out.cover = URL.createObjectURL(new Blob([body.subarray(p)], {type: mime}));
      }catch{ /* обложка необязательна */ }
    }
    offset += headerLen + frameSize;
  }
  return (out.title || out.artist || out.cover) ? out : null;
}

