/**
 * Firebase ID-token authentication for API requests.
 *
 * Staff authorisation reads the `role` custom claim (set only by the server, see
 * SET_STAFF_ROLE and scripts/grant-super-admin.ts) and checks it against the
 * permission map in src/types/admin.ts. Password accounts must have a verified
 * email before any staff role is honoured.
 */
import type { VercelRequest } from '@vercel/node';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import { isStaffRole, roleHasPermission, type Permission, type StaffRole } from '../../src/types/admin';
import { ApiError } from './errors';
import { getHeader } from './http';

export type TokenVerifier = Pick<Auth, 'verifyIdToken'>;

export interface AuthenticatedUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  signInProvider: string | null;
}

export interface StaffUser extends AuthenticatedUser {
  role: StaffRole;
}

export function bearerToken(req: VercelRequest): string | null {
  const header = getHeader(req, 'authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function toUser(decoded: DecodedIdToken): AuthenticatedUser {
  return {
    uid: decoded.uid,
    email: decoded.email?.toLowerCase() ?? null,
    emailVerified: decoded.email_verified === true,
    signInProvider: decoded.firebase?.sign_in_provider ?? null,
  };
}

async function verify(verifier: TokenVerifier, token: string, checkRevoked: boolean): Promise<DecodedIdToken> {
  try {
    return await verifier.verifyIdToken(token, checkRevoked);
  } catch {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
}

/** Customer identity when a bearer token is present; null for guests. An invalid token is a 401, not a guest. */
export async function optionalUser(req: VercelRequest, verifier: TokenVerifier): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  return toUser(await verify(verifier, token, false));
}

/** Pure authorisation decision for a decoded staff token (exported for tests). */
export function authoriseStaff(decoded: DecodedIdToken, permission: Permission | null): StaffUser {
  const user = toUser(decoded);
  const role = decoded.role;
  if (!isStaffRole(role)) throw new ApiError(403, 'FORBIDDEN', 'This account does not have staff access.');
  if (user.signInProvider === 'password' && !user.emailVerified) {
    throw new ApiError(403, 'FORBIDDEN', 'Verify your email address before using staff tools.');
  }
  if (permission && !roleHasPermission(role, permission)) {
    throw new ApiError(403, 'FORBIDDEN', `Your role (${role}) does not allow this action.`);
  }
  return { ...user, role };
}

/** Requires a staff token (revocation checked, so demotions take effect immediately). */
export async function requireStaff(
  req: VercelRequest,
  verifier: TokenVerifier,
  permission: Permission | null,
): Promise<StaffUser> {
  const token = bearerToken(req);
  if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in with a staff account.');
  return authoriseStaff(await verify(verifier, token, true), permission);
}
