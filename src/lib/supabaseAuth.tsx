/**
 * supabaseAuth.tsx — Supabase Auth context & hooks
 * Replaces Clerk entirely.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  signOut: () => Promise<void>;
  /** True after the user opens a "reset your password" email link. The
   *  session is real at that point, but they haven't set a password yet -
   *  the app should show a "set new password" screen instead of the
   *  normal dashboard until they do. */
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  session: null,
  isLoaded: false,
  isSignedIn: false,
  userId: null,
  userEmail: null,
  signOut: async () => {},
  isPasswordRecovery: false,
  clearPasswordRecovery: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let settled = false;
    const settle = (session: Session | null) => {
      settled = true;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoaded(true);
    };

    // Set up auth listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);
        settle(session);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      settle(session);
    });

    // supabase-js can occasionally hang forever on getSession()/the auth
    // state callback (e.g. a stuck cross-tab lock, a network request that
    // never resolves after the tab was backgrounded) which would otherwise
    // leave the app stuck on the "Authenticating..." spinner indefinitely.
    // Give it a few seconds, then unblock the UI unconditionally rather
    // than issuing another getSession() call - that call would wait on the
    // exact same stuck lock and could hang forever too. If the original
    // call (or onAuthStateChange) does eventually resolve, `settle` still
    // runs and updates the UI from this fallback state.
    const timeout = setTimeout(() => {
      if (settled) return;
      console.warn("[AuthProvider] Auth check timed out, unblocking UI");
      settle(null);
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Mobile browsers suspend network activity while backgrounded; if the app
  // is reopened mid-auth-check (or the check silently died in the
  // background), re-run it instead of leaving a stale spinner/state up.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoaded(true);
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  const value: AuthCtx = {
    user,
    session,
    isLoaded,
    isSignedIn: !!session,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    signOut,
    isPasswordRecovery,
    clearPasswordRecovery,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
