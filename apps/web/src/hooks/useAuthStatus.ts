'use client';

import { useEffect, useState, useCallback } from "react";
import type { Account } from "appwrite";
import { OAuthProvider } from "appwrite";

type User = {
  name?: string;
  email?: string;
  prefs?: Record<string, unknown>;
};

export function useAuthStatus() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT;
    if (!endpoint || !project) {
      setLoading(false);
      setUser(null);
      return;
    }
    import("@/lib/appwrite").then(({ getAppwriteAccount }) => {
      const account: Account = getAppwriteAccount();
      account
        .get()
        .then((u) => {
          const name = (u as { name?: string }).name;
          const email = (u as { email?: string }).email;
          const prefs = (u as { prefs?: Record<string, unknown> }).prefs;
          setUser({ name, email, prefs });
        })
        .catch(() => setUser(null))
        .finally(() => setLoading(false));
    });
  }, []);

  const login = useCallback(() => {
    import("@/lib/appwrite").then(({ getAppwriteAccount }) => {
      const account: Account = getAppwriteAccount();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const success = `${base}/auth/callback`;
      const failure = `${base}/auth/callback`;
      account.createOAuth2Token({
        provider: OAuthProvider.Google,
        success,
        failure,
      });
    });
  }, []);

  const logout = useCallback(async () => {
    import("@/lib/appwrite").then(async ({ getAppwriteAccount }) => {
      const account: Account = getAppwriteAccount();
      try {
        await account.deleteSession("current");
        setUser(null);
      } catch {}
    });
  }, []);

  return { user, loading, loggedIn: !!user, login, logout };
}
