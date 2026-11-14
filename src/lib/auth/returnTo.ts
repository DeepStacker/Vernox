/**
 * "Sign in, then come back here": /account?next=<path>. Only same-site paths are accepted, so the parameter can
 * never send a customer to another site (no //host, /\host or scheme).
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\r\n\t]/.test(raw)) return null;
  return raw.startsWith('/account') && !raw.startsWith('/account/') ? null : raw;
}

export const signInPath = (returnTo: string) => {
  const safe = safeReturnPath(returnTo);
  return safe ? `/account?next=${encodeURIComponent(safe)}` : '/account';
};
