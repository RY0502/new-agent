'use client';

import { useEffect, useState } from "react";
import { Account, OAuthProvider } from "appwrite";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LogIn, LogOut } from "lucide-react";

type User = {
  name?: string;
  email?: string;
  prefs?: Record<string, unknown>;
};

export default function UserStatus() {
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

  const login = () => {
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
  };

  const logout = async () => {
    import("@/lib/appwrite").then(async ({ getAppwriteAccount }) => {
      const account: Account = getAppwriteAccount();
      try {
        await account.deleteSession("current");
        setUser(null);
      } catch {}
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">…</div>;
  }

  if (!user) {
    return (
      <Button
        variant="default"
        onClick={login}
        className="rounded-full h-10 px-5 bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-md hover:shadow-lg hover:from-indigo-600 hover:to-cyan-600 active:scale-[0.98] transition-all"
      >
        <LogIn className="h-4 w-4 mr-2" />
        Sign In
      </Button>
    );
  }

  const initials = (user.name || user.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="glass rounded-full px-3 py-2 border shadow-sm flex items-center gap-3">
      <Avatar className="h-9 w-9 ring-1 ring-white/60 dark:ring-white/20">
        <AvatarImage alt={user.name || user.email || "User"} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="hidden md:flex md:flex-col">
        <div className="text-sm font-medium">{user.name || user.email}</div>
        <div className="text-xs text-muted-foreground">Signed in</div>
      </div>
      <Button
        variant="ghost"
        onClick={logout}
        className="rounded-full h-9 px-3 border hover:bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
      >
        <LogOut className="h-4 w-4 mr-1.5" />
        Sign Out
      </Button>
    </div>
  );
}
