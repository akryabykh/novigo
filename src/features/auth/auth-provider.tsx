// ============================================================
// AuthProvider — owns the Supabase session and the auth flows the
// screens need. MVP uses plain email + password (no email confirmation),
// so signup logs the user in immediately. Requires "Confirm email" to be
// OFF in Supabase → Authentication → Providers → Email.
// ============================================================
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { createProfile, getProfile, supabase } from '../../core/data';
import type { Profile } from '../../core/domain';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  /** create account with email + password; with email-confirm off this also signs in */
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  /** create the profile row with the user's name (after sign up); returns it */
  completeProfile: (name: { firstName: string; lastName?: string; middleName?: string }) => Promise<Profile>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Guard against the auth call hanging forever (e.g. cold Supabase project). */
function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}
const SLOW = 'Сервер долго не отвечает — попробуйте ещё раз.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    withTimeout(supabase.auth.getSession(), 15000, SLOW)
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setInitializing(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({ email: email.trim(), password }),
      15000,
      SLOW,
    );
    if (error) throw error;
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { error } = await withTimeout(
      supabase.auth.signUp({ email: email.trim(), password }),
      15000,
      SLOW,
    );
    if (error) throw error;
  };

  const completeProfile: AuthContextValue['completeProfile'] = async (name) => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) throw new Error('Нет активной сессии');
    const existing = await getProfile(uid);
    if (existing) return existing;
    return createProfile({
      id: uid,
      firstName: name.firstName.trim(),
      lastName: name.lastName?.trim() || null,
      middleName: name.middleName?.trim() || null,
    });
  };

  const sendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        initializing,
        signInWithPassword,
        signUpWithPassword,
        completeProfile,
        sendPasswordReset,
        updatePassword,
        signOut,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
