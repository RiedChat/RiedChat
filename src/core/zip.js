// ===================== core/zip.js =====================
// Минимальный ZIP-архиватор без сжатия (метод STORE) - пишет и читает
// только то, что сами же и создаём (features/stickers/share.js), поэтому
// сторонний пакет (pako/JSZip и т.п.) не нужен: стикеры - уже сжатые сами
// по себе форматы (PNG/WEBP/JPEG/GIF), а совместимость со сторонними
// zip-читалками (Проводник/Finder/unzip) сохраняется за счёт стандартного
// формата локальных заголовков + центрального каталога + EOCD - просто без
// компрессии данных.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes){
  let crc = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// DOS-дата/время для заголовков - не критично для нашего же readZip ниже
// (он их не проверяет), но нужно для валидности архива в сторонних читалках.
function dosDateTime(date){
  const d = date || new Date();
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const dt = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, dt };
}

function u16(v){ return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
function u32(v){ return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }
function utf8(str){ return new TextEncoder().encode(str); }

// entries: [{name: 'Пак/003-cat.png', data: Uint8Array|ArrayBuffer}].
// Возвращает Blob (application/zip). Работает целиком в памяти - архивы
// стикер-паков небольшие (лимит на файл - MAX_STICKER_BYTES в
// features/stickers/storage/types.js), поэтому это ок.
export async function buildZip(entries){
  const parts = [];
  const central = [];
  let offset = 0;
  const { time, dt } = dosDateTime();

  for(const entry of entries){
    const nameBytes = utf8(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0),
      ...u16(0), ...u16(time), ...u16(dt),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0),
    ]);
    const localOffset = offset;
    parts.push(localHeader, nameBytes, data);
    offset += localHeader.length + nameBytes.length + size;

    const centralHeader = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0),
      ...u16(0), ...u16(time), ...u16(dt),
      ...u32(crc), ...u32(size), ...u32(size),
      ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0),
      ...u32(localOffset),
    ]);
    central.push(centralHeader, nameBytes);
  }

  const centralOffset = offset;
  let centralSize = 0;
  central.forEach(p => { centralSize += p.length; });

  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0),
  ]);

  return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
}

// Разбирает ZIP, созданный buildZip выше. Другие методы сжатия (DEFLATE и
// т.п.) не поддерживаются - сюда попадают только архивы, которые сами же
// и запаковали (features/stickers/pack-card.js читает только присланные
// нашим же клиентом паки стикеров).
export async function readZip(blob){
  const buf = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tailStart = Math.max(0, buf.length - 22);
  if(view.getUint32(tailStart, true) !== 0x06054b50) throw new Error('не похоже на ZIP-архив (нет EOCD)');
  const entryCount = view.getUint16(tailStart + 10, true);
  const centralOffset = view.getUint32(tailStart + 16, true);

  const out = [];
  let p = centralOffset;
  for(let i = 0; i < entryCount; i++){
    if(view.getUint32(p, true) !== 0x02014b50) throw new Error('повреждённый центральный каталог ZIP');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    if(method !== 0) throw new Error('архив использует сжатие - поддерживается только несжатый (STORE)');

    // Размер данных берём из центрального каталога (надёжнее), локальный
    // заголовок нужен только чтобы узнать длину имени/extra перед данными.
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    out.push({ name, data: buf.slice(dataStart, dataStart + compSize) });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
