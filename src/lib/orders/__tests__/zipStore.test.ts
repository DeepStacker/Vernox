import { describe, expect, it } from 'vitest';
import { crc32, createZip } from '../zipStore';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('zipStore', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes a readable archive: central directory, names, sizes and stored data', () => {
    const zip = createZip([{ name: 'a.dxf', data: bytes('hello') }, { name: 'b é.svg', data: bytes('<svg/>') }], new Date(2026, 10, 6, 12, 0, 0));
    const view = new DataView(zip.buffer);
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);
    let pos = view.getUint32(eocd + 16, true);
    const found: { name: string; data: string; crc: number }[] = [];
    for (let i = 0; i < 2; i++) {
      expect(view.getUint32(pos, true)).toBe(0x02014b50);
      const size = view.getUint32(pos + 24, true);
      const nameLen = view.getUint16(pos + 28, true);
      const offset = view.getUint32(pos + 42, true);
      const name = new TextDecoder().decode(zip.slice(pos + 46, pos + 46 + nameLen));
      expect(view.getUint32(offset, true)).toBe(0x04034b50);
      const localNameLen = view.getUint16(offset + 26, true);
      const dataStart = offset + 30 + localNameLen;
      found.push({ name, data: new TextDecoder().decode(zip.slice(dataStart, dataStart + size)), crc: view.getUint32(pos + 16, true) });
      pos += 46 + nameLen;
    }
    expect(found.map(f => [f.name, f.data])).toEqual([['a.dxf', 'hello'], ['b é.svg', '<svg/>']]);
    expect(found[0].crc).toBe(crc32(bytes('hello')));
  });

  it('writes an empty archive', () => {
    expect(createZip([]).length).toBe(22);
  });
});
