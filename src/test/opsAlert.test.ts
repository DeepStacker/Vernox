import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_COOLDOWN_MS, MAX_PER_HOUR, reportServerError, resetOpsAlertThrottle } from '../../api/_lib/opsAlert';

const ENV = { RESEND_API_KEY: 're_k', NOTIFY_FROM_EMAIL: 'Vernox <o@vernox.in>', ADMIN_EMAIL: 'owner@vernox.in', DOMAIN: 'vernox.in' } as NodeJS.ProcessEnv;

function fakeFetch(status = 200) {
  return vi.fn(async (_url: string, _init: { method: string; headers: Record<string, string>; body?: string }) => ({ ok: status < 400, status, text: async () => '' }));
}

describe('server error alerts', () => {
  beforeEach(() => resetOpsAlertThrottle());

  it('mails the admin the context and first line only, never the stack', async () => {
    const fetch = fakeFetch();
    const err = new Error('Firestore unavailable\n    at secret/path.ts:1');
    await reportServerError('razorpay-webhook', err, ENV, fetch, 1_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetch.mock.calls[0][1].body!);
    expect(body.to).toEqual(['owner@vernox.in']);
    expect(body.subject).toBe('[vernox.in] Server error in razorpay-webhook');
    expect(body.text).toContain('Error: Firestore unavailable');
    expect(body.text).not.toContain('secret/path.ts');
  });

  it('prefers ALERT_EMAIL and does nothing without Resend or a recipient', () => {
    const fetch = fakeFetch();
    void reportServerError('a', new Error('x'), { ...ENV, ALERT_EMAIL: 'ops@vernox.in' }, fetch, 1);
    expect(JSON.parse(fetch.mock.calls[0][1].body!).to).toEqual(['ops@vernox.in']);
    expect(reportServerError('b', new Error('x'), { ...ENV, RESEND_API_KEY: '' }, fetch, 1)).toBeUndefined();
    expect(reportServerError('c', new Error('x'), { ...ENV, ADMIN_EMAIL: '' }, fetch, 1)).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends one alert per context per cooldown and caps the hourly total', () => {
    const fetch = fakeFetch();
    void reportServerError('cron', new Error('x'), ENV, fetch, 0);
    void reportServerError('cron', new Error('x'), ENV, fetch, CONTEXT_COOLDOWN_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    void reportServerError('cron', new Error('x'), ENV, fetch, CONTEXT_COOLDOWN_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (let i = 0; i < MAX_PER_HOUR + 5; i++) void reportServerError(`ctx-${i}`, new Error('x'), ENV, fetch, CONTEXT_COOLDOWN_MS + 1);
    expect(fetch).toHaveBeenCalledTimes(MAX_PER_HOUR);
  });

  it('swallows a provider failure so the API response is unaffected', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(reportServerError('x', new Error('y'), ENV, fakeFetch(500), 1)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Resend answered 500'));
    log.mockRestore();
  });
});
