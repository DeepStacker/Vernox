import { describe, expect, it } from 'vitest';
import { safeReturnPath, signInPath } from '@/lib/auth/returnTo';

describe('return to the page after sign-in', () => {
  it('accepts same-site paths and refuses anything that could leave the site', () => {
    expect(safeReturnPath('/account/consultations/abc')).toBe('/account/consultations/abc');
    expect(safeReturnPath('/shop?q=om')).toBe('/shop?q=om');
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/account', '/a\nb', '', null]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
    expect(signInPath('/account/spaces')).toBe('/account?next=%2Faccount%2Fspaces');
    expect(signInPath('//evil.com')).toBe('/account');
  });
});
