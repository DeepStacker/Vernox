import { describe, expect, it } from 'vitest';
import { blockedSource, shouldLog, violationsFrom } from '../../api/csp-report';
import { CSP_REPORT_ONLY } from '../../server/apiRouter';

describe('CSP violation reports', () => {
  it('reads report-uri and Reporting API bodies, keeping only origins', () => {
    expect(violationsFrom({ 'csp-report': {
      'document-uri': 'https://shop.example.in/checkout?token=secret',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://evil.example/x.js?k=1',
    } })).toEqual([{ directive: 'script-src-elem', blocked: 'https://evil.example', page: 'https://shop.example.in' }]);
    expect(violationsFrom([{ type: 'csp-violation', body: { documentURL: 'https://shop.example.in/', effectiveDirective: 'img-src', blockedURL: 'inline' } }]))
      .toEqual([{ directive: 'img-src', blocked: 'inline', page: 'https://shop.example.in' }]);
    expect(violationsFrom(null)).toEqual([]);
    expect(blockedSource('data:image/png;base64,AAA')).toBe('data');
  });

  it('logs each directive and origin once an hour', () => {
    expect(shouldLog('img-src https://a.example', 1_000)).toBe(true);
    expect(shouldLog('img-src https://a.example', 2_000)).toBe(false);
    expect(shouldLog('img-src https://a.example', 1_000 + 60 * 60 * 1000)).toBe(true);
  });

  it('allows the payment and sign-in providers and nothing inline for scripts', () => {
    expect(CSP_REPORT_ONLY).toContain('https://checkout.razorpay.com');
    expect(CSP_REPORT_ONLY).toContain('https://*.firebaseapp.com');
    expect(CSP_REPORT_ONLY).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});
