/**
 * Firebase Auth state for both customers and staff.
 * Staff identity is NEVER derived from emails or Firestore profile flags: it is the `role`
 * custom claim on the ID token, read with a forced refresh so role changes apply promptly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getIdTokenResult, onAuthStateChanged,
  signInWithEmailAndPassword, signInWithPopup, signOut as firebaseSignOut, type User,
} from 'firebase/auth';
import { appFirestore } from '@/lib/appFirestore';
import { auth, googleProvider } from '@/lib/firebase';
import type { CustomerAccount } from '@/types/store';
import { ROLE_PERMISSIONS, isStaffRole, type RolePermissions, type StaffRole } from './permissions';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

interface AuthCtx {
  user: User | null;
  /** True until Firebase has reported the initial auth state and claims were read. */
  loading: boolean;
  profile: CustomerAccount | null;
  staffRole: StaffRole | null;
  permissions: RolePermissions | null;
  isStaff: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<CustomerAccount>) => Promise<void>;
  /** Signs in and succeeds only when the account carries a staff role claim. */
  staffSignIn: (email: string, password: string) => Promise<StaffRole>;
  refreshClaims: () => Promise<StaffRole | null>;
}

const AuthContext = createContext<AuthCtx | null>(null);

async function readStaffRole(user: User): Promise<StaffRole | null> {
  const token = await getIdTokenResult(user, true);
  const role = token.claims.role;
  return isStaffRole(role) ? role : null;
}

// Profiles live in Firestore, which loads only once someone is signed in (appFirestore), so guests'
// first page load never carries the Firestore SDK.
async function loadProfile(user: User): Promise<CustomerAccount> {
  const { db, doc, getDoc, setDoc } = await appFirestore();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...(snap.data() as CustomerAccount), uid: user.uid, email: user.email ?? '' };
  const created: CustomerAccount = {
    uid: user.uid,
    email: (user.email ?? '').toLowerCase(),
    name: user.displayName ?? '',
    country: 'India',
    isGoogleUser: user.providerData.some(p => p.providerId === 'google.com'),
  };
  const { uid: _uid, ...stored } = created;
  await setDoc(ref, stored);
  return created;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerAccount | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async next => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setStaffRole(null);
        setLoading(false);
        return;
      }
      try {
        const [role, prof] = await Promise.all([readStaffRole(next), loadProfile(next)]);
        setStaffRole(role);
        setProfile(prof);
      } catch (err) {
        // Keep the session usable with a minimal profile, but never grant a role we could not verify.
        console.error('[auth] could not load profile or claims:', err);
        setStaffRole(null);
        setProfile({ uid: next.uid, email: next.email ?? '', name: next.displayName ?? '' });
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider as GoogleAuthProvider);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const email = input.email.trim().toLowerCase();
    const cred = await createUserWithEmailAndPassword(auth, email, input.password);
    const { password: _password, ...rest } = input;
    const { db, doc, setDoc } = await appFirestore();
    const stored: CustomerAccount = { ...rest, email, country: input.country || 'India', isGoogleUser: false };
    await setDoc(doc(db, 'users', cred.user.uid), JSON.parse(JSON.stringify(stored)));
    setProfile({ ...stored, uid: cred.user.uid });
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<CustomerAccount>) => {
    const current = auth.currentUser;
    if (!current) throw new Error('You are signed out.');
    const { uid: _uid, email: _email, ...writable } = updates;
    const { db, doc, updateDoc } = await appFirestore();
    await updateDoc(doc(db, 'users', current.uid), JSON.parse(JSON.stringify(writable)));
    setProfile(prev => (prev ? { ...prev, ...writable } : prev));
  }, []);

  const refreshClaims = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return null;
    const role = await readStaffRole(current);
    setStaffRole(role);
    return role;
  }, []);

  const staffSignIn = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    const role = await readStaffRole(cred.user);
    if (!role) {
      await firebaseSignOut(auth);
      throw new Error('This account does not have staff access.');
    }
    setStaffRole(role);
    return role;
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user, loading, profile, staffRole,
      permissions: staffRole ? ROLE_PERMISSIONS[staffRole] : null,
      isStaff: staffRole !== null,
      signIn, signInWithGoogle, register, signOut, updateProfile, staffSignIn, refreshClaims,
    }),
    [user, loading, profile, staffRole, signIn, signInWithGoogle, register, signOut, updateProfile, staffSignIn, refreshClaims],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
