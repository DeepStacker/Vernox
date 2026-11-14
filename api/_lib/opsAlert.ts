/**
 * E-mails the owner when the API hits an unexpected server error, so a failing payment webhook or cron is noticed
 * the same day instead of from a customer. Uses the Resend key from Settings > Integrations; without it, or without
 * a recipient (ALERT_EMAIL, else ADMIN_EMAIL from install.sh), errors are only logged as before.
 *
 * Throttled per context (one mail per CONTEXT_COOLDOWN_MS) and overall (MAX_PER_HOUR), so an outage sends a handful
 * of mails, not thousands. The throttle is per process, which is right for the single-VM deployment. Only the
 * context and the error's first line are sent: no stack, request body or headers.
 */
import type { FetchLike } from './notifications/channels';

export const CONTEXT_COOLDOWN_MS = 15 * 60_000;
export const MAX_PER_HOUR = 10;

const lastByContext = new Map<string, number>();
let sentThisHour: number[] = [];

export function resetOpsAlertThrottle() {
  lastByContext.clear();
  sentThisHour = [];
}

function recipient(env: NodeJS.ProcessEnv): string | undefined {
  return env.ALERT_EMAIL?.trim() || env.ADMIN_EMAIL?.trim() || undefined;
}

function summarize(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.split('\n')[0].slice(0, 300);
}

/**
 * Sends at most one alert for `context` per cooldown. Never throws and never delays the response: the caller does
 * not await it. Returns the send promise for tests.
 */
export function reportServerError(
  context: string,
  err: unknown,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  now = Date.now(),
): Promise<void> | undefined {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.NOTIFY_FROM_EMAIL?.trim();
  const to = recipient(env);
  if (!apiKey || !from || !to) return undefined;

  const last = lastByContext.get(context);
  if (last !== undefined && now - last < CONTEXT_COOLDOWN_MS) return undefined;
  sentThisHour = sentThisHour.filter(t => now - t < 3_600_000);
  if (sentThisHour.length >= MAX_PER_HOUR) return undefined;
  lastByContext.set(context, now);
  sentThisHour.push(now);

  const site = env.DOMAIN?.trim() || env.VITE_SITE_URL?.trim().replace(/^https?:\/\//, '') || 'Vernox';
  const text = [
    `The server hit an unexpected error in "${context}" at ${new Date(now).toISOString()}.`,
    '',
    summarize(err),
    '',
    `Further errors in "${context}" are not mailed for ${CONTEXT_COOLDOWN_MS / 60_000} minutes.`,
    'Details are in the server log: docker compose logs app --since 1h',
  ].join('\n');

  return fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `[${site}] Server error in ${context}`, text }),
  })
    .then(res => {
      if (!res.ok) console.error(`[ops-alert] Resend answered ${res.status}; alert for ${context} not sent`);
    })
    .catch(e => console.error(`[ops-alert] alert for ${context} not sent:`, e instanceof Error ? e.message : e));
}
