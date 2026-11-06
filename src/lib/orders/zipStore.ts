/**
 * Minimal ZIP writer (STORE method, no compression) for bundling an order's production
 * files into one download. Cut files are small text, an order has at most a few dozen of
 * them, and writing the archive ourselves avoids adding a zip dependency to the admin bundle.
 * Limits: classic ZIP (under 65,535 entries, 4 GiB) — far above what an order can hold.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time fields for `date` (the format ZIP uses; resolution 2 s, year 1980+). */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function createZip(entries: readonly ZipEntry[], modified: Date = new Date()): Uint8Array {
  if (entries.length > 0xffff) throw new Error('Too many files for one zip.');
  const encoder = new TextEncoder();
  const { time, day } = dosDateTime(modified);
  const names = entries.map(e => encoder.encode(e.name));
  const localSize = entries.reduce((n, e, i) => n + 30 + names[i].length + e.data.length, 0);
  const centralSize = names.reduce((n, name) => n + 46 + name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets: number[] = [];

  entries.forEach((entry, i) => {
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true); // version needed
    view.setUint16(pos + 6, 0x0800, true); // UTF-8 names
    view.setUint16(pos + 8, 0, true); // STORE
    view.setUint16(pos + 10, time, true);
    view.setUint16(pos + 12, day, true);
    view.setUint32(pos + 14, crc32(entry.data), true);
    view.setUint32(pos + 18, entry.data.length, true);
    view.setUint32(pos + 22, entry.data.length, true);
    view.setUint16(pos + 26, names[i].length, true);
    view.setUint16(pos + 28, 0, true); // no extra field
    out.set(names[i], pos + 30);
    out.set(entry.data, pos + 30 + names[i].length);
    pos += 30 + names[i].length + entry.data.length;
  });

  const centralStart = pos;
  entries.forEach((entry, i) => {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true); // version made by
    view.setUint16(pos + 6, 20, true); // version needed
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, time, true);
    view.setUint16(pos + 14, day, true);
    view.setUint32(pos + 16, crc32(entry.data), true);
    view.setUint32(pos + 20, entry.data.length, true);
    view.setUint32(pos + 24, entry.data.length, true);
    view.setUint16(pos + 28, names[i].length, true);
    // extra, comment, disk number, internal and external attributes stay 0
    view.setUint32(pos + 42, offsets[i], true);
    out.set(names[i], pos + 46);
    pos += 46 + names[i].length;
  });

  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - centralStart, true);
  view.setUint32(pos + 16, centralStart, true);
  return out;
}
