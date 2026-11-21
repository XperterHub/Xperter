import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, LogOut, MessageSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { SilkBackground } from "@/components/SilkBackground";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { signOut, useAuthState } from "@/lib/auth";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Account — Xperter" },
      { name: "description", content: "Manage your signed-in Xperter account profile." },
      { property: "og:title", content: "Account — Xperter" },
      { property: "og:description", content: "Manage your signed-in Xperter account profile." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const nav = useNavigate();
  const { user, authReady } = useAuthState();

  useEffect(() => {
    if (authReady && !user) {
      nav({ to: "/sign-in" });
    }
  }, [authReady, user, nav]);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    nav({ to: "/sign-in" });
  };

  if (!authReady) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center px-4 py-8 text-foreground">
        <SilkBackground />
        <div className="py-8 text-center text-sm text-muted-foreground">
          Checking authentication state…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 text-foreground">
      <SilkBackground />

      {/* Top action bar */}
      <div className="mb-4 flex w-full max-w-2xl items-center justify-between">
        <Link
          to="/app/messages"
          className="glass-pill liquid-press inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge shadow-sm"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Workspace</span>
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          className="glass-pill liquid-press inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground hover:text-destructive border border-glass-edge shadow-sm transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>

      {/* Shifted Profile Component (from Screenshot 1) */}
      <div className="w-full max-w-2xl animate-liquid">
        <ProfileCard />
      </div>

      {/* Quick Jump Bar */}
      <div className="mt-4 flex w-full max-w-2xl flex-wrap items-center justify-center gap-3">
        <Link
          to="/app/page-2"
          className="glass-pill liquid-press inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-foreground hover:bg-glass-strong border border-glass-edge shadow-xs"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Open Cloudup &amp; Document Vault</span>
        </Link>
        <Link
          to="/app/messages"
          className="btn-ink liquid-press inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold shadow-xs"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Messages Workspace</span>
        </Link>
      </div>
    </main>
  );
}
