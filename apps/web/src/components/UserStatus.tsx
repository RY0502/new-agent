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
      } catch { }
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">…</div>;
  }

  if (!user) {
    return (
      <Button
        variant="premium"
        onClick={login}
        className="rounded-full px-6 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
      >
        <LogIn className="h-4 w-4 mr-2" />
        Sign In
      </Button>
    );
  }

  const initials = (user.name || user.email || "U").slice(0, 2).toUpperCase();

  return (
    <div className="glass rounded-full px-3 py-1.5 border-white/10 shadow-lg flex items-center gap-3 hover:border-white/20 transition-all duration-300">
      <Avatar className="h-8 w-8 ring-2 ring-indigo-500/30">
        <AvatarImage alt={user.name || user.email || "User"} />
        <AvatarFallback className="bg-indigo-500/10 text-indigo-400 text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="hidden md:flex md:flex-col leading-tight">
        <div className="text-[13px] font-semibold text-white/90">{user.name || user.email}</div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Authenticated</div>
      </div>
      <Button
        variant="glass"
        size="sm"
        onClick={logout}
        className="rounded-full h-8 px-3 border-white/5 hover:bg-white/5 text-white/60 hover:text-white transition-all"
      >
        <LogOut className="h-3.5 w-3.5 mr-1.5" />
        <span className="text-xs">Sign Out</span>
      </Button>
    </div>
  );
}
