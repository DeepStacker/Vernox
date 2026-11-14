// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { productSchema } from '../../api/_lib/catalogAdmin';
import { products } from '@/lib/catalog';

describe('server product schema accepts the catalogue the storefront ships with', () => {
  it('every sample product can be re-saved through SAVE_PRODUCT unchanged', () => {
    const failures = products
      .map(p => ({ id: p.id, result: productSchema.safeParse(JSON.parse(JSON.stringify(p))) }))
      .filter(r => !r.result.success)
      .map(r => `${r.id}: ${!r.result.success ? r.result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ') : ''}`);
    expect(failures).toEqual([]);
  });
});
